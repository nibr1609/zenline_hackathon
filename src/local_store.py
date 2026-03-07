import json
import os

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config


class LocalStore:
    """Simple JSON file-backed key-value store mapping reference → product data.

    Stores embedding_text and the original product JSON for each indexed product.
    Loaded fully into memory; written to disk after indexing.
    """

    def __init__(self, path: str = None):
        self.path = path or config.LOCAL_STORE_PATH
        self._data: dict[str, dict] = {}

    def load(self):
        """Load store from disk. Call this before querying."""
        if os.path.exists(self.path):
            with open(self.path, "r", encoding="utf-8") as f:
                self._data = json.load(f)
            print(f"Loaded {len(self._data)} products from local store ({self.path})")
        else:
            print(f"No local store found at {self.path} — starting empty.")
            self._data = {}

    def save_to_disk(self):
        """Persist the in-memory store to disk."""
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(self._data, f, ensure_ascii=False, indent=2)
        print(f"Saved {len(self._data)} products to {self.path}")

    def put(self, reference: str, embedding_text: str, original_product: dict):
        """Add or overwrite an entry."""
        self._data[reference] = {
            "embedding_text": embedding_text,
            "original_product": original_product,
        }

    def get(self, reference: str) -> dict | None:
        """Retrieve entry by reference. Returns None if not found."""
        return self._data.get(reference)

    def __len__(self):
        return len(self._data)
