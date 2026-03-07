import weaviate
from weaviate.classes.init import Auth
from weaviate.classes.config import Configure, Property, DataType

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config

_client = None


def get_client() -> weaviate.WeaviateClient:
    global _client
    if _client is None:
        _client = weaviate.connect_to_weaviate_cloud(
            cluster_url=config.WEAVIATE_URL,
            auth_credentials=Auth.api_key(config.WEAVIATE_API_KEY),
        )
    return _client


def close_client():
    global _client
    if _client is not None:
        _client.close()
        _client = None


def ensure_collection():
    """Create the ProductSubstitute collection if it doesn't exist."""
    client = get_client()
    if client.collections.exists(config.COLLECTION_NAME):
        return

    client.collections.create(
        name=config.COLLECTION_NAME,
        vectorizer_config=Configure.Vectorizer.text2vec_weaviate(),
        properties=[
            # Vectorized
            Property(name="embedding_text", data_type=DataType.TEXT),
            # Metadata only (not vectorized)
            Property(name="reference", data_type=DataType.TEXT, skip_vectorization=True),
            Property(name="competitor_retailer", data_type=DataType.TEXT, skip_vectorization=True),
            Property(name="competitor_product_name", data_type=DataType.TEXT, skip_vectorization=True),
            Property(name="competitor_url", data_type=DataType.TEXT, skip_vectorization=True),
            Property(name="competitor_price", data_type=DataType.NUMBER, skip_vectorization=True),
            # scraped=True means this came from all_products.json (our scraped e-tec catalog)
            # scraped=False (default) means this came from the competitor target pool
            Property(name="scraped", data_type=DataType.BOOL, skip_vectorization=True),
        ],
    )
    print(f"Created collection: {config.COLLECTION_NAME}")


def get_existing_references() -> set[str]:
    """Return the set of references already in the collection."""
    client = get_client()
    if not client.collections.exists(config.COLLECTION_NAME):
        return set()
    collection = client.collections.get(config.COLLECTION_NAME)
    refs = set()
    for obj in collection.iterator(return_properties=["reference"]):
        ref = obj.properties.get("reference")
        if ref:
            refs.add(ref)
    return refs


def batch_insert(objects: list[dict], scraped: bool = False):
    """Insert a list of product dicts into Weaviate in batches.

    Each dict must have: embedding_text, reference, competitor_retailer,
    competitor_product_name, competitor_url, competitor_price.

    Args:
        scraped: If True, marks these products as scraped (from all_products.json).
                 If False (default), they are regular target-pool competitor products.
    """
    client = get_client()
    collection = client.collections.get(config.COLLECTION_NAME)

    total = len(objects)
    inserted = 0

    with collection.batch.dynamic() as batch:
        for obj in objects:
            props = {
                "embedding_text": obj.get("embedding_text", ""),
                "reference": obj.get("reference") or "",
                "competitor_retailer": obj.get("competitor_retailer") or "",
                "competitor_product_name": obj.get("competitor_product_name") or "",
                "competitor_url": obj.get("competitor_url") or "",
                "scraped": scraped,
            }
            price = obj.get("competitor_price")
            if price is not None:
                props["competitor_price"] = float(price)

            batch.add_object(properties=props)
            inserted += 1
            if inserted % 100 == 0:
                print(f"  Queued {inserted}/{total}...")

    print(f"Inserted {inserted}/{total} objects into Weaviate.")


def near_text_search(query: str, limit: int = 50, scraped_filter: bool | None = None) -> list[dict]:
    """Search for similar products using nearText (auto-vectorized by Weaviate).

    Args:
        scraped_filter: If True/False, only return scraped/non-scraped products.
                        If None (default), return all.

    Returns list of dicts with: reference, competitor_retailer,
    competitor_product_name, competitor_url, competitor_price, scraped, score
    """
    client = get_client()
    collection = client.collections.get(config.COLLECTION_NAME)

    filters = None
    if scraped_filter is True:
        filters = weaviate.classes.query.Filter.by_property("scraped").equal(True)
    elif scraped_filter is False:
        # NOT scraped==True catches both scraped=False and scraped=null (older entries)
        filters = ~weaviate.classes.query.Filter.by_property("scraped").equal(True)

    response = collection.query.near_text(
        query=query,
        limit=limit,
        filters=filters,
        return_metadata=weaviate.classes.query.MetadataQuery(distance=True),
    )

    results = []
    for obj in response.objects:
        results.append({
            "reference": obj.properties.get("reference"),
            "competitor_retailer": obj.properties.get("competitor_retailer"),
            "competitor_product_name": obj.properties.get("competitor_product_name"),
            "competitor_url": obj.properties.get("competitor_url"),
            "competitor_price": obj.properties.get("competitor_price"),
            "scraped": bool(obj.properties.get("scraped", False)),
            "weaviate_distance": obj.metadata.distance if obj.metadata else None,
        })

    return results


def delete_collection():
    """Drop and recreate the collection (for re-indexing)."""
    client = get_client()
    if client.collections.exists(config.COLLECTION_NAME):
        client.collections.delete(config.COLLECTION_NAME)
        print(f"Deleted collection: {config.COLLECTION_NAME}")
