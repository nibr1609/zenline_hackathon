"""Product Substitute Matching System — CLI Entry Point

Usage:
  # Index the target pool
  python -m src.main index --file target_pool_tv_&_audio.json
  python -m src.main index --file target_pool_tv_&_audio.json --reset

  # Search by source product reference (looks up from source JSON)
  python -m src.main search --reference P_0A7A0D68 --source source_products_tv_&_audio.json

  # Search by free text
  python -m src.main search --text "Samsung 65 Zoll 4K TV unter 600 Euro"

  # Search by raw JSON
  python -m src.main search --json '{"name":"LG 32 Zoll TV","price_eur":199}'
"""

import argparse
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def cmd_index(args):
    from src.indexer import run_indexing
    run_indexing(file_path=args.file, reset=args.reset, max_workers=args.workers, chunk_size=args.chunk_size, scraped=args.scraped)


def cmd_search(args):
    from src.searcher import search
    from src.reranker import rerank
    from src.local_store import LocalStore

    # Resolve the product input
    if args.reference:
        if not args.source:
            print("ERROR: --source is required when using --reference", file=sys.stderr)
            sys.exit(1)
        with open(args.source, "r", encoding="utf-8") as f:
            source_products = json.load(f)
        product_input = next(
            (p for p in source_products if p.get("reference") == args.reference), None
        )
        if product_input is None:
            print(f"ERROR: Reference {args.reference!r} not found in {args.source}", file=sys.stderr)
            sys.exit(1)
    elif args.text:
        product_input = args.text
    elif args.json:
        product_input = args.json  # searcher handles JSON string parsing
    else:
        print("ERROR: One of --reference, --text, or --json is required", file=sys.stderr)
        sys.exit(1)

    # Load local store once
    store = LocalStore()
    store.load()

    # Retrieve from Weaviate
    source_result, candidates = search(
        product_input=product_input,
        top_k=args.top_k,
        store=store,
    )

    print(f"\nSource product: {source_result.competitor_product_name or 'unknown'}")
    print(f"Retrieved {len(candidates)} candidates from Weaviate\n")

    if args.no_rerank:
        for i, r in enumerate(candidates):
            _print_result(i + 1, r)
    else:
        reranked = rerank(
            source_text=source_result.embedding_text,
            candidates=candidates,
        )
        print(f"\n=== {len(reranked)} High-Confidence Substitutes ===\n")
        for r in reranked:
            _print_result(r["rerank_position"], r)


def _print_result(position: int, result: dict):
    print(f"#{position}")
    print(f"  Name:     {result.get('competitor_product_name', 'N/A')}")
    print(f"  Retailer: {result.get('competitor_retailer', 'N/A')}")
    print(f"  Price:    {result.get('competitor_price', 'N/A')} EUR")
    print(f"  URL:      {result.get('competitor_url', 'N/A')}")
    print(f"  Ref:      {result.get('reference', 'N/A')}")
    if result.get("weaviate_distance") is not None:
        print(f"  Distance: {result['weaviate_distance']:.4f}")
    print()


def main():
    parser = argparse.ArgumentParser(description="Product Substitute Matching System")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # --- index ---
    index_parser = subparsers.add_parser("index", help="Index target pool products")
    index_parser.add_argument("--file", required=True, help="Path to target pool JSON file")
    index_parser.add_argument(
        "--reset", action="store_true",
        help="Delete and recreate the Weaviate collection before indexing"
    )
    index_parser.add_argument(
        "--workers", type=int, default=10,
        help="Number of parallel LLM calls per chunk (default: 10)"
    )
    index_parser.add_argument(
        "--chunk-size", type=int, default=50, dest="chunk_size",
        help="Products per chunk before flushing to Weaviate (default: 50)"
    )
    index_parser.add_argument(
        "--scraped", action="store_true",
        help="Mark indexed products as scraped=True (use for all_products.json)"
    )

    # --- search ---
    search_parser = subparsers.add_parser("search", help="Search for substitute products")
    input_group = search_parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument("--reference", help="Source product reference (e.g. P_0A7A0D68)")
    input_group.add_argument("--text", help="Free text product description")
    input_group.add_argument("--json", dest="json", help="Product as JSON string")

    search_parser.add_argument(
        "--source", default="source_products_tv_&_audio.json",
        help="Path to source products JSON (used with --reference)"
    )
    search_parser.add_argument("--top-k", type=int, default=50, help="Candidates to retrieve from Weaviate")
    search_parser.add_argument("--no-rerank", action="store_true", help="Skip GPT-4o reranking, show raw Weaviate results")

    args = parser.parse_args()

    if args.command == "index":
        cmd_index(args)
    elif args.command == "search":
        cmd_search(args)


if __name__ == "__main__":
    main()
