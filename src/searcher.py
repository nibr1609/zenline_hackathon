import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.preprocessor import generate, PreprocessorResult
from src.weaviate_client import near_text_search, ensure_collection
from src.local_store import LocalStore


def search(
    product_input,
    top_k: int = None,
    store: LocalStore = None,
    preprocessing_notes: str | None = None,
    scraped_filter: bool | None = None,
    _source_result: "PreprocessorResult | None" = None,
) -> tuple[PreprocessorResult, list[dict]]:
    """Search for substitute products.

    Args:
        product_input: Product dict, JSON string, or free text description
        top_k: Number of candidates to retrieve from Weaviate (default from config)
        store: Pre-loaded LocalStore instance (loaded from disk if not provided)
        scraped_filter: If True/False, restrict Weaviate results to that bucket only
        _source_result: Pre-built PreprocessorResult to skip LLM preprocessing

    Returns:
        (source_result, candidates) where candidates are Weaviate results
        enriched with embedding_text and original_product from the local store
    """
    import config
    top_k = top_k or config.DEFAULT_TOP_K

    if _source_result is not None:
        source_result = _source_result
    else:
        # Parse JSON string if needed
        if isinstance(product_input, str):
            try:
                product_input = json.loads(product_input)
            except (json.JSONDecodeError, ValueError):
                pass  # treat as free text

        print("Generating embedding text for source product...")
        source_result = generate(product_input, additional_notes=preprocessing_notes)
        print(f"Source: {source_result.competitor_product_name or 'unknown'}")

    print(f"Querying Weaviate for top {top_k} candidates (scraped={scraped_filter})...")
    ensure_collection()
    raw_candidates = near_text_search(query=source_result.embedding_text, limit=top_k, scraped_filter=scraped_filter)
    print(f"Retrieved {len(raw_candidates)} candidates from Weaviate")

    # Load store if not provided
    if store is None:
        store = LocalStore()
        store.load()

    # Enrich candidates with embedding_text + original product from local store
    candidates = []
    for c in raw_candidates:
        ref = c.get("reference")
        stored = store.get(ref) if ref else None
        candidates.append({
            **c,
            "embedding_text": stored["embedding_text"] if stored else "",
            "original_product": stored["original_product"] if stored else None,
        })

    return source_result, candidates
