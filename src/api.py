"""FastAPI backend for natural-language product substitute queries.

Run with:
    uvicorn src.api:app --reload
"""

import hashlib
import json
import sys
import os
import time
import uuid
import subprocess

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import openai
from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File, Form, Header, Depends
from pydantic import BaseModel
import tempfile

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
                "scraped": r.get("scraped", False),
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


# ---------------------------------------------------------------------------
# Stats endpoint
# ---------------------------------------------------------------------------

@app.get("/stats")
def stats():
    """Return counts of indexed products split by scraped vs database."""
    store = _get_store()
    total = len(store._data)
    scraped = sum(
        1 for d in store._data.values()
        if d.get("original_product", {}).get("scraped", False)
    )
    return {"total": total, "scraped": scraped, "database": total - scraped}


# ---------------------------------------------------------------------------
# Products browse endpoint
# ---------------------------------------------------------------------------

@app.get("/products")
def products_list(page: int = 1, limit: int = 48, scraped: str = "all", q: str = ""):
    """Browse all indexed products with optional filter and pagination."""
    store = _get_store()
    q_lower = q.strip().lower()

    items = []
    for ref, data in store._data.items():
        product = data.get("original_product", {})
        name = (
            product.get("name")
            or product.get("competitor_product_name")
            or product.get("title")
            or ""
        )
        if not name:
            continue
        if q_lower and q_lower not in name.lower():
            continue

        is_scraped = bool(product.get("scraped", False))
        if scraped == "scraped" and not is_scraped:
            continue
        if scraped == "database" and is_scraped:
            continue

        price = product.get("price_eur") or product.get("competitor_price") or product.get("price")
        retailer = product.get("retailer") or product.get("competitor_retailer") or product.get("shop")

        items.append({
            "reference": ref,
            "name": name,
            "price": float(price) if price is not None else None,
            "retailer": retailer,
            "image_url": product.get("image_url"),
            "scraped": is_scraped,
            "url": product.get("url") or product.get("competitor_url"),
        })

    total_count = len(items)
    start = (page - 1) * limit
    return {
        "items": items[start: start + limit],
        "total": total_count,
        "page": page,
        "pages": max(1, (total_count + limit - 1) // limit),
    }


# ---------------------------------------------------------------------------
# Scrape task (background, live log via polling)
# ---------------------------------------------------------------------------

_scrape_tasks: dict[str, dict] = {}
_index_tasks: dict[str, dict] = {}


def _run_scrape_task(task_id: str, keywords: list[str], output_file: str) -> None:
    logs: list[str] = _scrape_tasks[task_id]["logs"]
    try:
        import tempfile
        script = (
            f"import sys; sys.path.insert(0, {repr(os.getcwd())})\n"
            f"from src.scrape_searches import scrape_searches\n"
            f"scrape_searches({repr(keywords)}, output_json={repr(output_file)})\n"
        )
        tmp = tempfile.NamedTemporaryFile(suffix=".py", delete=False, mode="w")
        tmp.write(script)
        tmp.close()

        process = subprocess.Popen(
            [sys.executable, tmp.name],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
        for line in process.stdout:  # type: ignore[union-attr]
            line = line.strip()
            if line:
                logs.append(line)
        process.wait()
        os.unlink(tmp.name)

        if process.returncode == 0:
            _scrape_tasks[task_id]["status"] = "done"
            logs.append(f"✓ Done — output: {output_file}")
        else:
            _scrape_tasks[task_id]["status"] = "error"
            logs.append("✗ Scrape process exited with error")
    except Exception as exc:
        _scrape_tasks[task_id]["status"] = "error"
        logs.append(f"✗ {exc}")


class ScrapeStartRequest(BaseModel):
    keywords: list[str]
    output_file: str = "data/scraped_manual.json"


@app.post("/scrape/start")
def scrape_start(request: ScrapeStartRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())[:8]
    _scrape_tasks[task_id] = {
        "status": "running",
        "logs": [f"Starting scrape for {len(request.keywords)} keyword(s)…"],
        "started_at": time.time(),
        "output_file": request.output_file,
    }
    background_tasks.add_task(_run_scrape_task, task_id, request.keywords, request.output_file)
    return {"task_id": task_id}


@app.get("/scrape/status/{task_id}")
def scrape_status(task_id: str):
    task = _scrape_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


# ---------------------------------------------------------------------------
# Index task (background, live log via polling)
# ---------------------------------------------------------------------------

def _run_index_task(task_id: str, file_path: str, scraped: bool, reset: bool) -> None:
    logs: list[str] = _index_tasks[task_id]["logs"]
    try:
        cmd = [sys.executable, "-m", "src.main", "index", "--file", file_path]
        if scraped:
            cmd.append("--scraped")
        if reset:
            cmd.append("--reset")

        process = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            cwd=os.getcwd(),
        )
        for line in process.stdout:  # type: ignore[union-attr]
            line = line.strip()
            if line:
                logs.append(line)
        process.wait()

        if process.returncode == 0:
            _index_tasks[task_id]["status"] = "done"
            logs.append(f"✓ Indexing complete — {file_path}")
        else:
            _index_tasks[task_id]["status"] = "error"
            logs.append("✗ Index process exited with error")
    except Exception as exc:
        _index_tasks[task_id]["status"] = "error"
        logs.append(f"✗ {exc}")


class IndexStartRequest(BaseModel):
    file_path: str
    scraped: bool = False
    reset: bool = False


@app.post("/index/start")
def index_start(request: IndexStartRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())[:8]
    _index_tasks[task_id] = {
        "status": "running",
        "logs": [f"Indexing {request.file_path}…"],
        "started_at": time.time(),
    }
    background_tasks.add_task(_run_index_task, task_id, request.file_path, request.scraped, request.reset)
    return {"task_id": task_id}


@app.get("/index/status/{task_id}")
def index_status(task_id: str):
    task = _index_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@app.post("/index/upload")
async def index_upload(
    background_tasks: BackgroundTasks,
    file: UploadFile | None = File(default=None),
    json_content: str | None = Form(default=None),
    scraped: bool = Form(default=False),
    reset: bool = Form(default=False),
):
    """Index from an uploaded file or pasted JSON content."""
    content: bytes | None = None
    label = "uploaded content"

    if file and file.filename:
        content = await file.read()
        label = file.filename
    elif json_content:
        content = json_content.encode()
        label = "pasted JSON"

    if not content:
        raise HTTPException(status_code=422, detail="No file or JSON content provided")

    try:
        json.loads(content)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=422, detail=f"Invalid JSON: {e}")

    tmp = tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="wb")
    tmp.write(content)
    tmp.close()

    task_id = str(uuid.uuid4())[:8]
    _index_tasks[task_id] = {
        "status": "running",
        "logs": [f"Indexing {label}…"],
        "started_at": time.time(),
    }
    background_tasks.add_task(_run_index_task, task_id, tmp.name, scraped, reset)
    return {"task_id": task_id}
