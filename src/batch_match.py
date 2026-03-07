"""Batch match all source products against the indexed target pool.

Outputs TWO JSON files per run:
  {output}          — competitors from the regular database (scraped=False)
  {output_scraped}  — competitors from the scraped catalog (scraped=True)

Usage:
  python -m src.batch_match
  python -m src.batch_match --source source_products_tv_&_audio.json --output match_results_tv_audio.json
  python -m src.batch_match --no-rerank
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.searcher import search
from src.reranker import rerank
from src.local_store import LocalStore


def _scraped_output_path(output_file: str) -> str:
    """Derive the scraped output path: e.g. results.json -> results_scraped.json"""
    base, ext = os.path.splitext(output_file)
    return f"{base}_scraped{ext}"


def _format_competitor(candidate: dict) -> dict:
    return {
        "reference": candidate.get("reference"),
        "competitor_retailer": candidate.get("competitor_retailer"),
        "competitor_product_name": candidate.get("competitor_product_name"),
        "competitor_url": candidate.get("competitor_url"),
        "competitor_price": candidate.get("competitor_price"),
        "scraped": candidate.get("scraped", False),
    }


def run_batch_match(
    source_file: str,
    output_file: str,
    top_k: int = 100,
    top_n: int = 80,
    no_rerank: bool = False,
):
    """
    Args:
        top_k: Candidates fetched per bucket (database + scraped) from Weaviate
        top_n: Total results — split evenly: top_n/2 from database, top_n/2 from scraped
        no_rerank: Skip reranking entirely, return all top_k Weaviate results per bucket
    """
    scraped_output_file = _scraped_output_path(output_file)
    half_n = top_n // 2

    with open(source_file, "r", encoding="utf-8") as f:
        source_products = json.load(f)

    print(f"Loaded {len(source_products)} source products from {source_file}")
    print(f"Database output : {output_file}")
    print(f"Scraped output  : {scraped_output_file}")
    if no_rerank:
        print(f"Mode: top {top_k} per bucket from Weaviate (no reranking)")
    else:
        print(f"Mode: top {top_k} per bucket → reranking ({half_n} database + {half_n} scraped = {top_n} total)")

    store = LocalStore()
    store.load()

    results_db: list[dict] = []
    results_scraped: list[dict] = []
    total = len(source_products)

    for i, product in enumerate(source_products):
        source_ref = product.get("reference", f"unknown_{i}")
        name = product.get("name", source_ref)
        print(f"\n[{i + 1}/{total}] {name[:70]}")

        try:
            # Search each bucket separately so we always get candidates from both
            source_result, db_candidates = search(
                product_input=product,
                top_k=top_k,
                store=store,
                scraped_filter=False,
            )
            _, scraped_candidates = search(
                product_input=product,
                top_k=top_k,
                store=store,
                scraped_filter=True,
                _source_result=source_result,
            )

            if no_rerank:
                db_competitors = [_format_competitor(c) for c in db_candidates]
                scraped_competitors = [_format_competitor(c) for c in scraped_candidates]
            else:
                reranked_db = rerank(
                    source_text=source_result.embedding_text,
                    candidates=db_candidates,
                    exact_n=half_n,
                )
                reranked_scraped = rerank(
                    source_text=source_result.embedding_text,
                    candidates=scraped_candidates,
                    exact_n=half_n,
                )
                db_competitors = [_format_competitor(r) for r in reranked_db]
                scraped_competitors = [_format_competitor(r) for r in reranked_scraped]

            print(f"  -> {len(db_competitors)} database matches, {len(scraped_competitors)} scraped matches")

        except Exception as e:
            print(f"  ERROR: {e}")
            db_competitors = []
            scraped_competitors = []

        results_db.append({
            "source_reference": source_ref,
            "competitors": db_competitors,
        })
        results_scraped.append({
            "source_reference": source_ref,
            "competitors": scraped_competitors,
        })

        # Write both files incrementally so partial progress is preserved on crash
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(results_db, f, ensure_ascii=False, indent=2)
        with open(scraped_output_file, "w", encoding="utf-8") as f:
            json.dump(results_scraped, f, ensure_ascii=False, indent=2)

    print(f"\nDone.")
    print(f"  Database results -> {output_file}")
    print(f"  Scraped results  -> {scraped_output_file}")
    return results_db, results_scraped


def main():
    parser = argparse.ArgumentParser(description="Batch match all source products to substitutes")
    parser.add_argument(
        "--source", default="source_products_tv_&_audio.json",
        help="Path to source products JSON"
    )
    parser.add_argument(
        "--output", default="match_results.json",
        help="Output file for database matches (scraped output is auto-derived as *_scraped.json)"
    )
    parser.add_argument(
        "--top-k", type=int, default=100,
        help="Candidates to retrieve from Weaviate per product (default: 100)"
    )
    parser.add_argument(
        "--top-n", type=int, default=80, dest="top_n",
        help="Return exactly N results split evenly between database and scraped (default: 80)"
    )
    parser.add_argument(
        "--no-rerank", action="store_true",
        help="Skip reranking, include all top-k Weaviate results"
    )
    args = parser.parse_args()

    run_batch_match(
        source_file=args.source,
        output_file=args.output,
        top_k=args.top_k,
        top_n=args.top_n,
        no_rerank=args.no_rerank,
    )


if __name__ == "__main__":
    main()
