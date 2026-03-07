"""FastAPI backend for natural-language product substitute queries.

Run with:
    uvicorn src.api:app --reload
"""

import hashlib
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import openai
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

import config
from src.searcher import search
from src.reranker import rerank
from src.local_store import LocalStore

app = FastAPI(title="Product Substitute Matcher")

from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def _make_token() -> str:
    return hashlib.sha256(
        f"{config.AUTH_USERNAME}:{config.AUTH_PASSWORD}:{config.AUTH_SECRET}".encode()
    ).hexdigest()

_VALID_TOKEN = _make_token()


class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/auth/login")
def login(request: LoginRequest):
    if request.username != config.AUTH_USERNAME or request.password != config.AUTH_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": _VALID_TOKEN}


def require_auth(authorization: str | None = Header(None)) -> None:
    if authorization != f"Bearer {_VALID_TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized")


# Load store once at startup
_store: LocalStore | None = None


def _get_store() -> LocalStore:
    global _store
    if _store is None:
        _store = LocalStore()
        _store.load()
    return _store


# ---------------------------------------------------------------------------
# Prompt parser
# ---------------------------------------------------------------------------

_PARSE_SYSTEM_PROMPT = """You are a query parser for a product substitute matching system.

Extract structured information from the user's natural language query and return JSON with exactly these keys:

{
  "product_input": "free-text description of the product to find substitutes for (required)",
  "preprocessing_notes": "extra emphasis or context for embedding generation, e.g. 'emphasize refresh rate and HDR tier' — or null",
  "reranking_constraints": "filter instructions for the reranker, e.g. 'only include products from amazon.de' or 'price must be under 500 euros' — or null",
  "top_n": <integer if the user asks for a specific number of results, otherwise null>
}

Rules:
- product_input must always be a descriptive string — never null.
- If the user mentions a specific retailer or website to filter by, put it in reranking_constraints.
- If the user wants special attribute emphasis (e.g. "focus on refresh rate"), put it in preprocessing_notes.
- If the user asks for a specific count (e.g. "top 5"), set top_n to that integer."""

_parse_client: openai.OpenAI | None = None


def _get_parse_client() -> openai.OpenAI:
    global _parse_client
    if _parse_client is None:
        _parse_client = openai.OpenAI(
            api_key=config.OPENROUTER_API_KEY,
            base_url=config.OPENROUTER_BASE_URL,
        )
    return _parse_client


def _parse_prompt(prompt: str) -> dict:
    """Use GPT-4o to extract structured params from the user's natural language prompt."""
    client = _get_parse_client()
    response = client.chat.completions.create(
        model=config.OPENAI_MODEL,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": _PARSE_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
    )
    return json.loads(response.choices[0].message.content.strip())


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class AnalyzeRequest(BaseModel):
    prompt: str
    top_k: int = 100  # candidates fetched from Weaviate


class CompetitorResult(BaseModel):
    reference: str | None
    competitor_retailer: str | None
    competitor_product_name: str | None
    competitor_url: str | None
    competitor_price: float | None
    image_url: str | None = None
    rerank_position: int | None = None


class AnalyzeResponse(BaseModel):
    product_input: str
    preprocessing_notes: str | None
    reranking_constraints: str | None
    top_n: int | None
    total_candidates_retrieved: int
    competitors: list[CompetitorResult]


# ---------------------------------------------------------------------------
# Suggestions endpoint (fast local-store substring search, no LLM)
# ---------------------------------------------------------------------------

@app.get("/suggestions")
def suggestions(q: str = "", limit: int = 8, _: None = Depends(require_auth)):
    """Return products from the local store whose name contains the query string."""
    q = q.strip()
    if len(q) < 2:
        return []

    store = _get_store()
    q_lower = q.lower()
    results = []

    for ref, data in store._data.items():
        product = data.get("original_product", {})
        name = (
            product.get("name")
            or product.get("competitor_product_name")
            or product.get("title")
            or ""
        )
        if not name or q_lower not in name.lower():
            continue

        price = product.get("price_eur") or product.get("competitor_price") or product.get("price")
        retailer = product.get("retailer") or product.get("competitor_retailer") or product.get("shop")

        results.append({
            "reference": ref,
            "name": name,
            "price": float(price) if price is not None else None,
            "retailer": retailer,
            "image_url": product.get("image_url"),
        })

        if len(results) >= limit:
            break

    return results


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest, _: None = Depends(require_auth)):
    """Accept a natural language prompt, run the full matching pipeline, return results."""

    # 1. Parse the prompt
    try:
        parsed = _parse_prompt(request.prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prompt parsing failed: {e}")

    product_input: str = parsed.get("product_input", "")
    if not product_input:
        raise HTTPException(status_code=422, detail="Could not extract a product description from the prompt.")

    preprocessing_notes: str | None = parsed.get("preprocessing_notes") or None
    reranking_constraints: str | None = parsed.get("reranking_constraints") or None
    top_n: int | None = parsed.get("top_n") or None

    # 2. Search (preprocess + Weaviate nearText)
    try:
        source_result, candidates = search(
            product_input=product_input,
            top_k=request.top_k,
            store=_get_store(),
            preprocessing_notes=preprocessing_notes,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {e}")

    total_candidates = len(candidates)

    # 3. Rerank
    try:
        reranked = rerank(
            source_text=source_result.embedding_text,
            candidates=candidates,
            exact_n=top_n,
            additional_constraints=reranking_constraints,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reranking failed: {e}")

    # 4. Format output
    competitors = [
        CompetitorResult(
            reference=r.get("reference"),
            competitor_retailer=r.get("competitor_retailer"),
            competitor_product_name=r.get("competitor_product_name"),
            competitor_url=r.get("competitor_url"),
            competitor_price=r.get("competitor_price"),
            image_url=(r.get("original_product") or {}).get("image_url"),
            rerank_position=r.get("rerank_position"),
        )
        for r in reranked
    ]

    return AnalyzeResponse(
        product_input=product_input,
        preprocessing_notes=preprocessing_notes,
        reranking_constraints=reranking_constraints,
        top_n=top_n,
        total_candidates_retrieved=total_candidates,
        competitors=competitors,
    )


# ---------------------------------------------------------------------------
# Chat endpoint (intent-aware conversational interface)
# ---------------------------------------------------------------------------

_CHAT_INTENT_PROMPT = """You are a routing assistant for a product substitute matching service. Always return valid JSON.

Analyze the user's message in the context of the conversation history, then decide the action and return a JSON object with the following structure:

1. SEARCH — The user clearly wants to find substitutes for a specific product AND a price is present in the message or conversation history.
   Return JSON: {"action": "search", "product_description": "<full product description including price>", "user_price": <float>}

2. ASK_PRICE — The user wants to find substitutes for a product but has NOT mentioned a price or budget anywhere.
   Return JSON: {"action": "ask_price", "message": "<friendly one-sentence reply asking for their price or budget>"}

3. CHAT — General question, greeting, or anything unrelated to substitute-finding.
   Return JSON: {"action": "chat", "message": "<helpful, concise reply>"}

Be strict: only trigger SEARCH when there is both a clear substitute-finding intent AND an explicit price/budget figure."""


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []


class ChatApiResponse(BaseModel):
    type: str  # "chat" | "clarification" | "results"
    message: str
    results: dict | None = None


@app.post("/chat", response_model=ChatApiResponse)
def chat(request: ChatRequest, _: None = Depends(require_auth)):
    """Conversational endpoint: detects intent and runs the pipeline when appropriate."""
    client = _get_parse_client()

    # Build message list for intent detection (last 10 turns + current)
    history_messages = [
        {"role": h["role"], "content": h["content"]}
        for h in request.history[-10:]
    ]
    history_messages.append({"role": "user", "content": request.message})

    intent_resp = client.chat.completions.create(
        model=config.OPENAI_MODEL,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": _CHAT_INTENT_PROMPT},
            *history_messages,
        ],
    )
    intent = json.loads(intent_resp.choices[0].message.content.strip())
    action = intent.get("action")

    if action == "chat":
        return ChatApiResponse(type="chat", message=intent.get("message", ""), results=None)

    if action == "ask_price":
        return ChatApiResponse(type="clarification", message=intent.get("message", "Could you tell me your budget or the price of the product?"), results=None)

    if action == "search":
        product_description: str = intent.get("product_description", request.message)
        user_price: float | None = intent.get("user_price")

        try:
            source_result, candidates = search(
                product_input=product_description,
                top_k=100,
                store=_get_store(),
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Search failed: {e}")

        try:
            reranked = rerank(
                source_text=source_result.embedding_text,
                candidates=candidates,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Reranking failed: {e}")

        competitors = [
            {
                "reference": r.get("reference"),
                "competitor_retailer": r.get("competitor_retailer"),
                "competitor_product_name": r.get("competitor_product_name"),
                "competitor_url": r.get("competitor_url"),
                "competitor_price": r.get("competitor_price"),
                "image_url": (r.get("original_product") or {}).get("image_url"),
                "rerank_position": r.get("rerank_position"),
            }
            for r in reranked
        ]

        return ChatApiResponse(
            type="results",
            message=f"Found {len(competitors)} substitute{'s' if len(competitors) != 1 else ''} for you.",
            results={
                "product_name": source_result.competitor_product_name or product_description,
                "user_price": user_price,
                "competitors": competitors,
            },
        )

    return ChatApiResponse(type="chat", message="I'm here to help you find product substitutes. What are you looking for?", results=None)
