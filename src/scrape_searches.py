from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse, quote
import requests
import re
import time
import json
import html as html_lib
from pathlib import Path


def _clean_text(x):
    if x is None:
        return None
    return html_lib.unescape(str(x)).strip()


def extract_relevant_sequences(html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")

    out = {
        "json_ld": [],
        "meta_product": {},
        "meta_og": {},
        "nuxt_scripts": [],
        "product_attr_nodes": [],
        "urls": {},
    }

    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        txt = script.get_text(strip=True)
        if txt:
            out["json_ld"].append(txt)

    for meta in soup.find_all("meta"):
        key = meta.get("property") or meta.get("name")
        value = meta.get("content")
        if not key or value is None:
            continue

        key = key.strip()
        value = _clean_text(value)

        if key.startswith("product:"):
            out["meta_product"][key] = value
        elif key.startswith("og:"):
            out["meta_og"][key] = value

    canonical = soup.find("link", rel="canonical")
    if canonical and canonical.get("href"):
        out["urls"]["canonical"] = canonical["href"]

    for script in soup.find_all("script"):
        txt = script.string or script.get_text()
        if not txt:
            continue

        if "window.__NUXT__=" in txt or "__NUXT__=(" in txt:
            out["nuxt_scripts"].append(txt.strip())

    candidate_attrs = {
        "ean", "brandname", "priceuvp", "priceregular",
        "availabilitytext", "stockinfotext", "summary",
        "why2buy", "description", "url"
    }

    for tag in soup.find_all(True):
        tag_attr_keys = {k.lower() for k in tag.attrs.keys()}
        overlap = candidate_attrs.intersection(tag_attr_keys)
        if overlap:
            out["product_attr_nodes"].append({
                "tag": tag.name,
                "attrs": {k: v for k, v in tag.attrs.items()}
            })

    return out


def _try_json_loads(text):
    try:
        return json.loads(text)
    except Exception:
        return None


def _find_product_in_jsonld(blocks):
    for block in blocks:
        obj = _try_json_loads(block)
        if obj is None:
            continue

        candidates = obj if isinstance(obj, list) else [obj]
        for item in candidates:
            if isinstance(item, dict) and item.get("@type") == "Product":
                return item

            if isinstance(item, dict) and "@graph" in item:
                for g in item["@graph"]:
                    if isinstance(g, dict) and g.get("@type") == "Product":
                        return g
    return None


def _extract_from_meta(meta_product, meta_og):
    data = {}
    data["name"] = meta_og.get("og:title")
    data["description"] = meta_og.get("og:description")
    data["image_url"] = meta_og.get("og:image")
    data["brand"] = meta_product.get("product:brand")
    data["category"] = meta_product.get("product:category")
    data["price_eur"] = meta_product.get("product:sale_price:amount") or meta_product.get("product:price:amount")
    data["currency"] = meta_product.get("product:sale_price:currency") or meta_product.get("product:price:currency")
    data["availability"] = meta_product.get("product:availability")

    return {k: v for k, v in data.items() if v not in (None, "")}


def _extract_from_nuxt_script(script_text):
    def grab(pattern, cast=None):
        m = re.search(pattern, script_text, re.S)
        if not m:
            return None
        val = html_lib.unescape(m.group(1))
        if cast:
            try:
                return cast(val)
            except Exception:
                return None
        return val

    return {
        "id": grab(r'product:\{id:"([^"]+)"'),
        "name": grab(r'name:"([^"]+)"'),
        "summary": grab(r'summary:"([^"]*)"'),
        "ean": grab(r'ean:"([^"]+)"'),
        "brand": grab(r'brandName:"([^"]+)"'),
        "url": grab(r'url:"([^"]+)"'),
        "price_eur": grab(r'priceRegular:([0-9.]+)', float),
        "uvp_eur": grab(r'priceUvp:([0-9.]+)', float),
        "availability_text": grab(r'availabilityText:"([^"]+)"'),
        "stock_info_text": grab(r'stockInfoText:"([^"]+)"'),
        "why2buy": grab(r'why2Buy:"([^"]+)"'),
        "energy_label": grab(r'energyLabel:"([^"]+)"'),
    }


def _extract_from_product_attr_nodes(nodes):
    if not nodes:
        return {}

    node = max(nodes, key=lambda x: len(x.get("attrs", {})))
    attrs = {k.lower(): v for k, v in node["attrs"].items()}

    def num(x):
        try:
            return float(x)
        except Exception:
            return x

    return {
        "id": attrs.get("id"),
        "name": attrs.get("name"),
        "brand": attrs.get("brandname"),
        "ean": attrs.get("ean"),
        "url": attrs.get("url"),
        "summary": attrs.get("summary"),
        "description_html": attrs.get("description"),
        "why2buy": attrs.get("why2buy"),
        "price_eur": num(attrs.get("priceregular")) if attrs.get("priceregular") else None,
        "uvp_eur": num(attrs.get("priceuvp")) if attrs.get("priceuvp") else None,
        "availability_text": attrs.get("availabilitytext"),
        "stock_info_text": attrs.get("stockinfotext"),
    }


def extract_product_structured_data(html: str) -> dict:
    sequences = extract_relevant_sequences(html)
    result = {}

    product_jsonld = _find_product_in_jsonld(sequences["json_ld"])
    if product_jsonld:
        offers = product_jsonld.get("offers", {}) if isinstance(product_jsonld, dict) else {}
        result["json_ld"] = {
            "name": product_jsonld.get("name"),
            "brand": (
                product_jsonld.get("brand", {}).get("name")
                if isinstance(product_jsonld.get("brand"), dict)
                else product_jsonld.get("brand")
            ),
            "description": product_jsonld.get("description"),
            "image_url": (
                product_jsonld.get("image", [None])[0]
                if isinstance(product_jsonld.get("image"), list)
                else product_jsonld.get("image")
            ),
            "sku": product_jsonld.get("sku"),
            "mpn": product_jsonld.get("mpn"),
            "price_eur": offers.get("price"),
            "currency": offers.get("priceCurrency"),
            "availability": offers.get("availability"),
            "url": offers.get("url"),
        }

    meta_data = _extract_from_meta(sequences["meta_product"], sequences["meta_og"])
    if meta_data:
        result["meta"] = meta_data

    if sequences["nuxt_scripts"]:
        nuxt_data = _extract_from_nuxt_script(sequences["nuxt_scripts"][0])
        result["nuxt"] = {k: v for k, v in nuxt_data.items() if v not in (None, "")}

    attr_data = _extract_from_product_attr_nodes(sequences["product_attr_nodes"])
    if attr_data:
        result["html_attrs"] = {k: v for k, v in attr_data.items() if v not in (None, "")}

    if sequences["urls"]:
        result["urls"] = sequences["urls"]

    return result


search_url_etec = lambda question: (
    "https://www.e-tec.at/de/shop/suche.html?search="
    + quote(f'{{"query":"{question}","filters":{{}},"sorter":"_score desc"}}'),
    "https://www.e-tec.at"
)

search_url_expert = lambda question: (
    "https://www.expert.at/shop?q=" + quote(question),
    "https://www.expert.at"
)

search_url_electronic = lambda question: (
    "https://www.electronic4you.at/catalogsearch/result/?q=" + quote(question),
    "https://www.electronic4you.at"
)

search_urls = [search_url_etec, search_url_expert, search_url_electronic]

base_name = {
    "https://www.e-tec.at": "etec",
    "https://www.expert.at": "expert",
    "https://www.electronic4you.at": "electronics",
}


def safe_filename(url: str) -> str:
    path = urlparse(url).path.rstrip("/")
    slug = path.split("/")[-1] or "index"
    slug = re.sub(r"[^a-zA-Z0-9._-]", "_", slug)
    return f"{slug}.html"


def fetch_html(session: requests.Session, url: str, headers: dict) -> str:
    response = session.get(url, headers=headers, timeout=30)
    response.raise_for_status()
    return response.text


def scrape_searches(questions, output_json="all_products.json"):
    all_entries = []

    search_headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "de-AT,de;q=0.9,en;q=0.8",
    }

    product_headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/123.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "de-AT,de;q=0.9,en;q=0.8",
    }

    session = requests.Session()

    for question in questions:
        links_all = {}

        # 1) search result pages
        for search_url in search_urls:
            url, base = search_url(question)

            try:
                print(f"Search: {url}")
                response = session.get(url, headers=search_headers, timeout=20)
                response.raise_for_status()

                html = response.text
                soup = BeautifulSoup(html, "html.parser")

                links = []
                for a in soup.select("a[href]"):
                    href = a["href"].strip()

                    if "/shop/produkt/" in href:  # e-tec
                        links.append(href)

                    if href.startswith("/shop/") and "~p" in href:  # expert
                        links.append(urljoin(base, href))

                if base == "https://www.electronic4you.at":
                    links = [a["href"] for a in soup.select("p.product-name > a[href]")]

                seen = set()
                links = [x for x in links if not (x in seen or seen.add(x))]
                links_all[base] = links

                print(base)
                for link in links:
                    print(" ", link)

            except requests.RequestException as e:
                print(f"Search failed for {url}: {e}")
                links_all[base] = []

        # 2) product pages for this question
        for base, links in links_all.items():
            output_dir = Path(f"{base_name[base]}_{question}")
            output_dir.mkdir(exist_ok=True)

            for i, url in enumerate(links, start=1):
                try:
                    print(f"[{question}] [{base}] [{i}/{len(links)}] Fetching {url}")
                    html = fetch_html(session, url, product_headers)

                    out_file = output_dir / safe_filename(url)
                    out_file.write_text(html, encoding="utf-8")
                    print(f"  Saved HTML -> {out_file}")

                    data = extract_product_structured_data(html)

                    # add provenance fields
                    data["base_url"] = base
                    data["question"] = question
                    data["product_url"] = url

                    out_path = out_file.with_suffix(".json")
                    out_path.write_text(
                        json.dumps(data, indent=2, ensure_ascii=False),
                        encoding="utf-8",
                    )
                    print(f"  Written JSON -> {out_path}")

                    all_entries.append(data)

                    time.sleep(0.1)

                except requests.RequestException as e:
                    print(f"  Failed -> {url}")
                    print(f"  Error: {e}")
                except Exception as e:
                    print(f"  Parsing failed -> {url}")
                    print(f"  Error: {e}")

    Path(output_json).write_text(
        json.dumps(all_entries, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"\nWrote {len(all_entries)} entries to {output_json}")

    return all_entries