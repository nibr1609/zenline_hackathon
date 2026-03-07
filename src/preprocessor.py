import json
import openai
from typing import Union
from dataclasses import dataclass

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config

_client = None

def _get_client():
    global _client
    if _client is None:
        _client = openai.OpenAI(
            api_key=config.OPENROUTER_API_KEY,
            base_url=config.OPENROUTER_BASE_URL,
        )
    return _client


SYSTEM_PROMPT = """You are a product data specialist. Your job is to process product information and output two things:
1. A rich embedding text optimized for semantic similarity / substitute matching search
2. Normalized metadata fields

## Embedding Text Rules

The embedding text is used for SUBSTITUTE PRODUCT MATCHING. Two products are substitutes if they serve the same purpose with similar specs. The text must make similar products cluster together in vector space.

### Structure: lead with the PRIMARY MATCHING ATTRIBUTES, repeat them heavily, then add secondary details.

### For TVs and displays — PRIMARY attributes (repeat each 4-6 times in different wordings):
1. SCREEN SIZE — most important. Write all variants: "65 inch", "65 Zoll", "165cm", "165 Zentimeter", "65-Zoll-Fernseher", "65 inch TV", "65\" screen"
2. DISPLAY TECHNOLOGY — second most important: "QLED", "OLED", "LED", "Mini-LED", "LCD" — repeat 4-5 times
3. RESOLUTION — "4K", "UHD", "Ultra HD", "3840x2160", "4K UHD" OR "Full HD", "FullHD", "1080p", "1920x1080" OR "HD ready", "720p", "1366x768" — repeat 3-4 times
4. PRICE TIER — "budget TV unter 300 Euro", "mid-range 300-600 Euro", "premium über 600 Euro" + actual price

Then add secondary details (1-2 mentions each): Smart OS, HDR type, brand, refresh rate, connectivity.

### For audio products — PRIMARY attributes:
1. PRODUCT TYPE — "soundbar", "over-ear headphones", "in-ear earbuds", "Bluetooth speaker" — repeat 4-5 times
2. CONNECTIVITY — "wireless Bluetooth", "wired kabelgebunden", "USB-C" — repeat 3-4 times
3. KEY SPEC — audio watts, channels (2.1/5.1), ANC/noise-cancelling — repeat 3-4 times
4. PRICE TIER + actual price

### For appliances — PRIMARY attributes:
1. APPLIANCE TYPE — "Waschmaschine", "Geschirrspüler", "Kühlschrank", "Mikrowelle" — repeat 4-5 times
2. KEY CAPACITY/SIZE — liters, kg load, dimensions — repeat 3-4 times
3. ENERGY CLASS — "Energieklasse A", "A+++" — repeat 3 times
4. PRICE TIER + actual price

### General rules:
- Total length: 300–500 words
- Start IMMEDIATELY with the primary attributes (no intro sentences)
- Mix German and English naturally
- If specs are null, infer everything possible from the product name

## Output Format
Return ONLY valid JSON with this exact structure:
{
  "embedding_text": "...",
  "reference": "P_XXXXXXXX or null",
  "competitor_retailer": "retailer name or null",
  "competitor_product_name": "full product name",
  "competitor_url": "url or null",
  "competitor_price": 299.0 or null
}

## Field Extraction Rules
- reference: look for fields named "reference", "ref", "id", "product_id"
- competitor_retailer: look for "retailer", "shop", "store", "händler", "vendor"
- competitor_product_name: look for "name", "title", "product_name", "bezeichnung"
- competitor_url: look for "url", "link", "product_url"
- competitor_price: look for "price_eur", "price", "preis", "competitor_price" — return as float or null
- For free text input: extract whatever is mentioned, set null for missing fields"""


def generate(product_input: Union[dict, str], additional_notes: str | None = None) -> "PreprocessorResult":
    """Generate embedding text and extract metadata from a product.

    Args:
        product_input: Either a product dict (from JSON) or a free-text string
        additional_notes: Extra instructions appended to the system prompt (e.g. emphasize refresh rate)

    Returns:
        PreprocessorResult with embedding_text and metadata fields
    """
    if isinstance(product_input, dict):
        user_content = f"Process this product:\n\n{json.dumps(product_input, ensure_ascii=False, indent=2)}"
    else:
        user_content = f"Process this product description:\n\n{product_input}"

    system_prompt = SYSTEM_PROMPT
    if additional_notes:
        system_prompt += f"\n\n## Additional Instructions\n{additional_notes}"

    client = _get_client()
    response = client.chat.completions.create(
        model=config.OPENAI_MODEL,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
    )

    raw = response.choices[0].message.content.strip()
    data = json.loads(raw)

    return PreprocessorResult(
        embedding_text=data["embedding_text"],
        reference=data.get("reference"),
        competitor_retailer=data.get("competitor_retailer"),
        competitor_product_name=data.get("competitor_product_name"),
        competitor_url=data.get("competitor_url"),
        competitor_price=data.get("competitor_price"),
    )


@dataclass
class PreprocessorResult:
    embedding_text: str
    reference: str | None
    competitor_retailer: str | None
    competitor_product_name: str | None
    competitor_url: str | None
    competitor_price: float | None
