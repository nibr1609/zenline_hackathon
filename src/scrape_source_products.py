"""Generate search keywords from source products and scrape matching product pages.

For each source product an LLM generates 2 diverse search keywords.
All unique keywords are scraped in parallel across e-tec, expert.at, and
electronic4you.at. Product pages within each keyword are also fetched in
parallel. The result is a JSON file ready for indexing with:
    python -m src.main index --file <output> --scraped

Usage:
    python -m src.scrape_source_products \\
        --source source_products_tv_&_audio.json \\
        --output scraped_tv_audio.json

    python -m src.scrape_source_products \\
        --source source_products_small_appliances.json \\
        --output scraped_appliances.json
"""

import argparse
import json
import sys
import os
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urljoin
from pathlib import Path

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import openai
import config
from src.scrape_searches import (
    extract_product_structured_data,
    search_urls,
    base_name,
    safe_filename,
)

_client = None
_print_lock = threading.Lock()

# Limit concurrent requests per domain to avoid 503s from rate-limiting sites
_domain_semaphores: dict[str, threading.Semaphore] = {
    "https://www.electronic4you.at": threading.Semaphore(2),
    "https://www.e-tec.at": threading.Semaphore(5),
    "https://www.expert.at": threading.Semaphore(5),
}


def _get_client() -> openai.OpenAI:
    global _client
    if _client is None:
        _client = openai.OpenAI(
            api_key=config.OPENROUTER_API_KEY,
            base_url=config.OPENROUTER_BASE_URL,
        )
    return _client


def _log(*args):
    with _print_lock:
        print(*args)


_KEYWORD_SYSTEM = """You are a product search expert. Given a product, generate exactly 2 search keywords
that a person would type into a retailer's search bar to find this product or a close substitute.

Rules:
- Each keyword must be 2-5 words
- Keyword 1: SPECIFIC — brand + key model identifier + main spec (e.g. "Samsung UE65CU8079 4K", "LG OLED55C3 Zoll")
- Keyword 2: GENERIC — category + defining specs only, NO brand (e.g. "65 Zoll 4K OLED TV", "8kg Frontlader A+++")
- The two keywords must be maximally diverse — one brand-focused, one spec-focused
- Mix German and English naturally
- NO duplicate keywords

Return JSON: {"keywords": ["keyword1", "keyword2"]}"""


def generate_keywords_for_product(product: dict) -> list[str]:
    """Ask the LLM to generate 2 diverse search keywords for a source product."""
    client = _get_client()
    product_str = json.dumps(product, ensure_ascii=False, indent=2)

    response = client.chat.completions.create(
        model=config.OPENAI_MODEL,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": _KEYWORD_SYSTEM},
            {"role": "user", "content": f"Generate 2 diverse search keywords for this product:\n\n{product_str}"},
        ],
    )
    data = json.loads(response.choices[0].message.content.strip())
    return data.get("keywords", [])


_PRODUCT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "de-AT,de;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
}


def _fetch_product_page(session: requests.Session, url: str, base: str, keyword: str) -> dict | None:
    """Fetch and parse a single product page. Returns structured data or None on failure."""
    sem = _domain_semaphores.get(base)
    with sem if sem else threading.Lock():
        return _fetch_product_page_inner(session, url, base, keyword)


def _fetch_product_page_inner(session: requests.Session, url: str, base: str, keyword: str) -> dict | None:
    for attempt in range(3):
        try:
            response = session.get(url, headers=_PRODUCT_HEADERS, timeout=30)
            if response.status_code == 503 and attempt < 2:
                time.sleep(1.5 * (attempt + 1))
                continue
            response.raise_for_status()
            break
        except requests.exceptions.HTTPError as e:
            if attempt < 2 and e.response is not None and e.response.status_code in (503, 429):
                time.sleep(1.5 * (attempt + 1))
                continue
            _log(f"  [FAIL] {url}: {e}")
            return None
        except Exception as e:
            _log(f"  [FAIL] {url}: {e}")
            return None
    else:
        _log(f"  [FAIL] {url}: gave up after 3 attempts")
        return None

    try:
        html = response.text

        out_dir = Path(f"{base_name[base]}_{keyword}")
        out_dir.mkdir(exist_ok=True)
        out_file = out_dir / safe_filename(url)
        out_file.write_text(html, encoding="utf-8")

        data = extract_product_structured_data(html)
        data["base_url"] = base
        data["question"] = keyword
        data["product_url"] = url

        out_file.with_suffix(".json").write_text(
            json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        return data
    except Exception as e:
        _log(f"  [FAIL] {url}: {e}")
        return None


def _scrape_keyword(keyword: str, page_workers: int = 10) -> list[dict]:
    """Scrape all 3 retailers for one keyword. Product pages fetched in parallel."""
    search_headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "de-AT,de;q=0.9,en;q=0.8",
    }
    session = requests.Session()
    all_links: list[tuple[str, str]] = []  # (url, base)

    for search_url_fn in search_urls:
        url, base = search_url_fn(keyword)
        try:
            _log(f"  [SEARCH] {url}")
            resp = session.get(url, headers=search_headers, timeout=20)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "html.parser")

            links = []
            for a in soup.select("a[href]"):
                href = a["href"].strip()
                if "/shop/produkt/" in href:
                    links.append(href)
                if href.startswith("/shop/") and "~p" in href:
                    links.append(urljoin(base, href))
            if base == "https://www.electronic4you.at":
                links = [a["href"] for a in soup.select("p.product-name > a[href]")]

            seen: set[str] = set()
            links = [x for x in links if not (x in seen or seen.add(x))]  # type: ignore[func-returns-value]
            all_links.extend((link, base) for link in links)
        except Exception as e:
            _log(f"  [SEARCH FAIL] {url}: {e}")

    if not all_links:
        return []

    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=page_workers) as executor:
        futures = {
            executor.submit(_fetch_product_page, session, url, base, keyword): url
            for url, base in all_links
        }
        for future in as_completed(futures):
            data = future.result()
            if data is not None:
                results.append(data)

    _log(f"  [DONE] '{keyword}' → {len(results)} products")
    return results


def run_scrape_source_products(
    source_file: str,
    output_json: str,
    keyword_workers: int = 10,
    scrape_workers: int = 5,
    page_workers: int = 10,
):
    """
    Args:
        source_file:     Path to source_products_*.json
        output_json:     Output path for scraped products JSON
        keyword_workers: Parallel LLM calls for keyword generation
        scrape_workers:  Parallel keywords scraped at the same time
        page_workers:    Parallel product page fetches per keyword
    """
    with open(source_file, "r", encoding="utf-8") as f:
        source_products = json.load(f)

    print(f"Loaded {len(source_products)} source products from {source_file}")
    print(f"Generating 2 keywords per product ({keyword_workers} parallel LLM calls)...\n")

    all_keywords: list[str] = []
    errors = 0

    with ThreadPoolExecutor(max_workers=keyword_workers) as executor:
        future_to_product = {
            executor.submit(generate_keywords_for_product, p): p
            for p in source_products
        }
        for i, future in enumerate(as_completed(future_to_product), 1):
            product = future_to_product[future]
            name = product.get("name", product.get("reference", f"product_{i}"))
            try:
                keywords = future.result()
                print(f"  [{i}/{len(source_products)}] {name[:60]}")
                for kw in keywords:
                    print(f"    → {kw}")
                all_keywords.extend(keywords)
            except Exception as exc:
                print(f"  [{i}/{len(source_products)}] ERROR {name[:60]}: {exc}")
                errors += 1

    # Deduplicate while preserving order
    seen: set[str] = set()
    unique_keywords: list[str] = []
    for kw in all_keywords:
        kw_lower = kw.strip().lower()
        if kw_lower and kw_lower not in seen:
            seen.add(kw_lower)
            unique_keywords.append(kw.strip())

    print(f"\nGenerated {len(all_keywords)} keywords → {len(unique_keywords)} unique after deduplication")
    if errors:
        print(f"  ({errors} products failed keyword generation)")

    print(f"\nScraping {len(unique_keywords)} keywords with {scrape_workers} parallel scrapers "
          f"({page_workers} page fetches each) → {output_json}\n")

    all_entries: list[dict] = []
    with ThreadPoolExecutor(max_workers=scrape_workers) as executor:
        futures = {
            executor.submit(_scrape_keyword, kw, page_workers): kw
            for kw in unique_keywords
        }
        for future in as_completed(futures):
            entries = future.result()
            all_entries.extend(entries)

    Path(output_json).write_text(
        json.dumps(all_entries, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"\nDone. {len(all_entries)} products written to: {output_json}")
    print(f"Next step: python -m src.main index --file {output_json} --scraped")


def main():
    parser = argparse.ArgumentParser(
        description="Scrape product pages for all source products via LLM-generated keywords"
    )
    parser.add_argument(
        "--source", required=True,
        help="Path to source products JSON (e.g. source_products_tv_&_audio.json)"
    )
    parser.add_argument(
        "--output", required=True,
        help="Output JSON file for scraped products (e.g. scraped_tv_audio.json)"
    )
    parser.add_argument(
        "--keyword-workers", type=int, default=10, dest="keyword_workers",
        help="Parallel LLM calls for keyword generation (default: 10)"
    )
    parser.add_argument(
        "--scrape-workers", type=int, default=5, dest="scrape_workers",
        help="Keywords scraped in parallel (default: 5)"
    )
    parser.add_argument(
        "--page-workers", type=int, default=10, dest="page_workers",
        help="Parallel product page fetches per keyword (default: 10)"
    )
    args = parser.parse_args()

    run_scrape_source_products(
        source_file=args.source,
        output_json=args.output,
        keyword_workers=args.keyword_workers,
        scrape_workers=args.scrape_workers,
        page_workers=args.page_workers,
    )


if __name__ == "__main__":
    main()
