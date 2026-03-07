import json
import sys
import os
import hashlib
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.preprocessor import generate
from src.weaviate_client import ensure_collection, batch_insert, delete_collection, get_existing_references
from src.local_store import LocalStore


def load_products(file_path: str) -> list[dict]:
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


def _normalize_product(product: dict) -> dict:
    """Normalize any product format to a flat dict the preprocessor can handle.

    Handles two formats:
    1. Standard target-pool format — already flat, returned as-is.
    2. Scraped all_products.json format — has nested json_ld / meta / urls keys.
       Flattened and given a stable reference derived from SKU or URL hash.
    """
    if "json_ld" not in product:
        return product  # already standard format

    jld = product.get("json_ld") or {}
    meta = product.get("meta") or {}

    name = jld.get("name") or meta.get("name") or ""
    image_url = jld.get("image_url") or meta.get("image_url")
    url = jld.get("url") or product.get("product_url") or product.get("urls", {}).get("canonical")
    price_raw = jld.get("price_eur")
    try:
        price = float(price_raw) if price_raw is not None else None
    except (ValueError, TypeError):
        price = None

    sku = str(jld.get("sku") or "")
    base_url = product.get("base_url") or ""
    # Generate a stable 8-char reference from SKU + base_url, or URL hash
    seed = (sku + base_url) if sku else (url or name)
    ref = "SC_" + hashlib.md5(seed.encode()).hexdigest()[:8].upper()

    retailer = base_url.replace("https://", "").replace("http://", "").split("/")[0] if base_url else None

    return {
        "reference": ref,
        "name": name,
        "price_eur": price,
        "image_url": image_url,
        "url": url,
        "retailer": retailer,
        "brand": jld.get("brand"),
        "description": jld.get("description") or meta.get("description"),
        "scraped": True,
    }


def _process_one(args):
    product, index, total, lock = args
    ref = product.get("reference", f"unknown_{index}")
    name = product.get("name", ref)

    result = generate(product)
    reference = result.reference or ref

    with lock:
        print(f"  [{index}/{total}] {name[:60]}")

    return {
        "weaviate_obj": {
            "embedding_text": result.embedding_text,
            "reference": reference,
            "competitor_retailer": result.competitor_retailer,
            "competitor_product_name": result.competitor_product_name,
            "competitor_url": result.competitor_url,
            "competitor_price": result.competitor_price,
        },
        "store_entry": {
            "reference": reference,
            "embedding_text": result.embedding_text,
            "original_product": product,
        },
    }


def run_indexing(
    file_path: str,
    reset: bool = False,
    max_workers: int = 10,
    chunk_size: int = 50,
    scraped: bool = False,
):
    """Index products from a JSON file into Weaviate and local store.

    Processes products in chunks: each chunk runs LLM calls in parallel,
    then immediately flushes to Weaviate and saves the local store before
    moving to the next chunk.

    Args:
        file_path: Path to the JSON file (target pool or all_products.json)
        reset: Delete and recreate the Weaviate collection before indexing
        max_workers: Parallel LLM calls per chunk
        chunk_size: How many products to process before flushing to Weaviate
        scraped: Mark all inserted products as scraped=True in Weaviate
    """
    print(f"\n=== Indexing: {file_path} (scraped={scraped}) ===")
    raw_products = load_products(file_path)
    print(f"Loaded {len(raw_products)} products")

    # Normalize format (handles all_products.json nested structure)
    products = [_normalize_product(p) for p in raw_products]

    # Deduplicate within the file itself (same reference appearing twice)
    seen_in_file: set[str] = set()
    unique_products = []
    for p in products:
        ref = p.get("reference")
        if ref and ref in seen_in_file:
            continue
        if ref:
            seen_in_file.add(ref)
        unique_products.append(p)
    if len(unique_products) < len(products):
        print(f"Deduplicated {len(products) - len(unique_products)} duplicates within the file.")
    products = unique_products

    if reset:
        delete_collection()

    ensure_collection()

    # --- Duplicate detection ---
    store = LocalStore()
    if reset:
        print("Reset mode: ignoring local store, re-indexing everything.")
    else:
        store.load()

    local_refs = set(store._data.keys())

    print("Fetching existing references from Weaviate...")
    weaviate_refs = get_existing_references()
    existing_refs = local_refs | weaviate_refs

    to_process = [p for p in products if p.get("reference") not in existing_refs]
    skipped = len(products) - len(to_process)
    if skipped:
        print(f"Skipping {skipped} already indexed. Processing {len(to_process)} new products.")
    if not to_process:
        print("Nothing to index.")
        return 0, 0

    total = len(to_process)
    total_inserted = 0
    total_errors = 0
    lock = threading.Lock()

    # --- Chunk pipeline: LLM → Weaviate → repeat ---
    chunks = [to_process[i:i + chunk_size] for i in range(0, total, chunk_size)]
    print(f"\nProcessing {total} products in {len(chunks)} chunks of {chunk_size} "
          f"({max_workers} parallel LLM calls per chunk)\n")

    for chunk_idx, chunk in enumerate(chunks):
        chunk_start = chunk_idx * chunk_size
        print(f"--- Chunk {chunk_idx + 1}/{len(chunks)} "
              f"(products {chunk_start + 1}–{chunk_start + len(chunk)}) ---")

        args_list = [
            (product, chunk_start + i + 1, total, lock)
            for i, product in enumerate(chunk)
        ]

        weaviate_objects = []
        errors = []

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(_process_one, args): args[0] for args in args_list}
            for future in as_completed(futures):
                product = futures[future]
                ref = product.get("reference", "unknown")
                try:
                    result = future.result()
                    weaviate_objects.append(result["weaviate_obj"])
                    e = result["store_entry"]
                    store.put(
                        reference=e["reference"],
                        embedding_text=e["embedding_text"],
                        original_product=e["original_product"],
                    )
                except Exception as exc:
                    with lock:
                        print(f"  ERROR {ref}: {exc}")
                    errors.append(ref)

        # Flush this chunk to Weaviate immediately
        if weaviate_objects:
            print(f"  Inserting {len(weaviate_objects)} objects into Weaviate... (scraped={scraped})")
            batch_insert(weaviate_objects, scraped=scraped)

        # Save local store after each chunk so partial progress is preserved
        store.save_to_disk()

        total_inserted += len(weaviate_objects)
        total_errors += len(errors)

        if errors:
            print(f"  Failed in this chunk: {errors}")

        print(f"  Chunk done. Total so far: {total_inserted} inserted, {total_errors} errors.\n")

    print(f"=== Indexing complete: {total_inserted} inserted, {total_errors} errors ===")
    return total_inserted, total_errors
