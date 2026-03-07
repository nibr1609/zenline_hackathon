# System Architecture — Zenline Competitor Discovery

## Overview

The system is a fully automated competitor product matching pipeline for an Austrian electronics retailer. It combines vector search (Weaviate Cloud), LLM-based preprocessing and reranking (GPT-4o via OpenRouter), web scraping, and a conversational frontend.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DATA INGESTION                                     │
│                                                                                 │
│  ┌──────────────────────┐        ┌─────────────────────────────────────────┐   │
│  │  Target Pool JSON    │        │  Web Scraping (scrape_searches.py)      │   │
│  │  (visible retailers) │        │                                         │   │
│  │                      │        │  expert.at ──┐                          │   │
│  │  target_pool_*.json  │        │  e-tec.at ───┼──► BeautifulSoup/       │   │
│  └──────────┬───────────┘        │  electronic4 ┘    requests              │   │
│             │                    │  you.at           (rate limited)         │   │
│             │                    │       │                                  │   │
│             │                    │       ▼                                  │   │
│             │                    │  JSON-LD / meta / Nuxt extraction        │   │
│             │                    │       │                                  │   │
│             │                    │       ▼                                  │   │
│             │                    │  all_products.json                       │   │
│             │                    └───────────────────┬─────────────────────┘   │
│             │                                        │                         │
└─────────────┼────────────────────────────────────────┼─────────────────────────┘
              │                                        │
              └─────────────────┬──────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                           INDEXING PIPELINE (indexer.py)                      │
│                                                                               │
│   Normalize product format (_normalize_product)                               │
│          │                                                                    │
│          ▼                                                                    │
│   Deduplicate (reference-based)                                               │
│          │                                                                    │
│          ▼                                                                    │
│   ┌─────────────────────────────────────────────────┐                        │
│   │  ThreadPoolExecutor (parallel LLM calls)        │                        │
│   │                                                 │                        │
│   │  preprocessor.py (GPT-4o via OpenRouter)        │                        │
│   │  ┌───────────────────────────────────────┐      │                        │
│   │  │ Input: product dict / free text       │      │                        │
│   │  │ Output: embedding_text (300-500 words)│      │                        │
│   │  │         + normalized metadata         │      │                        │
│   │  └───────────────────────────────────────┘      │                        │
│   └───────────────────┬─────────────────────────────┘                        │
│                       │                                                       │
│          ┌────────────┴───────────┐                                           │
│          ▼                        ▼                                           │
│   ┌─────────────┐        ┌──────────────────────┐                            │
│   │ LocalStore  │        │  Weaviate Cloud       │                            │
│   │ (JSON file) │        │  (ProductSubstitute   │                            │
│   │             │        │   collection)         │                            │
│   │ reference → │        │                       │                            │
│   │  embedding_ │        │  text2vec vectorizer  │                            │
│   │  text +     │        │  scraped: bool flag   │                            │
│   │  original   │        │  (pool vs. scraped)   │                            │
│   │  product    │        └──────────────────────┘                            │
│   └─────────────┘                                                             │
└───────────────────────────────────────────────────────────────────────────────┘


┌───────────────────────────────────────────────────────────────────────────────┐
│                         MATCHING / QUERY PIPELINE                             │
│                                                                               │
│                                                                               │
│   Input: source product (dict / free text / reference)                        │
│          │                                                                    │
│          ▼                                                                    │
│   preprocessor.py ──► GPT-4o ──► embedding_text (source)                     │
│          │                                                                    │
│          ▼                                                                    │
│   searcher.py                                                                 │
│   ┌──────────────────────────────────────────────────────────┐               │
│   │  Weaviate nearText(embedding_text, limit=top_k)          │               │
│   │  ┌────────────────────┐    ┌───────────────────────┐     │               │
│   │  │ scraped_filter=False│    │ scraped_filter=True   │     │               │
│   │  │ (visible retailers) │    │ (scraped catalog)     │     │               │
│   │  └────────────────────┘    └───────────────────────┘     │               │
│   │           │                          │                    │               │
│   │           └──────────┬───────────────┘                    │               │
│   │                      ▼                                    │               │
│   │           Enrich with LocalStore data                     │               │
│   │           (embedding_text + original_product)             │               │
│   └──────────────────────┬───────────────────────────────────┘               │
│                          │                                                    │
│                          ▼                                                    │
│   reranker.py ──► GPT-4o                                                      │
│   ┌──────────────────────────────────────────────────────────┐               │
│   │  "Select genuine substitutes from candidates"            │               │
│   │  Criteria: same category, size, display tech,            │               │
│   │            resolution, price range (~50%)                │               │
│   │  Output: ranked list of candidate IDs                    │               │
│   └──────────────────────────────────────────────────────────┘               │
│                          │                                                    │
│                          ▼                                                    │
│              Reranked competitor matches                                      │
└───────────────────────────────────────────────────────────────────────────────┘


┌───────────────────────────────────────────────────────────────────────────────┐
│                              INTERFACES                                       │
│                                                                               │
│  ┌──────────────────────┐   ┌─────────────────────┐   ┌──────────────────┐  │
│  │    CLI (main.py)     │   │  REST API (api.py)   │   │  Batch Pipeline  │  │
│  │                      │   │  FastAPI + uvicorn   │   │  (batch_match.py)│  │
│  │  python -m src.main  │   │                      │   │                  │  │
│  │  index --file ...    │   │  POST /analyze       │   │  Runs all source  │  │
│  │  search --reference  │   │  POST /chat          │   │  products through │  │
│  │         --text       │   │  GET  /suggestions   │   │  full pipeline;  │  │
│  │         --json       │   │                      │   │  writes JSON     │  │
│  └──────────────────────┘   └──────────┬──────────┘   │  match results   │  │
│                                        │               └──────────────────┘  │
│                                        ▼                                     │
│                         ┌─────────────────────────┐                          │
│                         │  Next.js 15 Frontend     │                          │
│                         │  (TypeScript + Tailwind) │                          │
│                         │                          │                          │
│                         │  Chat interface          │                          │
│                         │  /analyze results view   │                          │
│                         │  Product suggestions     │                          │
│                         └─────────────────────────┘                          │
└───────────────────────────────────────────────────────────────────────────────┘


┌───────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL SERVICES                                    │
│                                                                               │
│  ┌────────────────────┐   ┌──────────────────────┐   ┌──────────────────┐   │
│  │  OpenRouter        │   │  Weaviate Cloud       │   │  Hackathon App   │   │
│  │  (GPT-4o)          │   │  (Vector DB)          │   │  /submit         │   │
│  │                    │   │                       │   │  /data           │   │
│  │  - preprocessing   │   │  - nearText search    │   │  /leaderboard    │   │
│  │  - reranking       │   │  - text2vec built-in  │   │                  │   │
│  │  - intent parsing  │   │  - scraped flag       │   │                  │   │
│  └────────────────────┘   └──────────────────────┘   └──────────────────┘   │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

| Component | File | Role |
|-----------|------|------|
| **Preprocessor** | `src/preprocessor.py` | GPT-4o call that converts any product input (dict, text) into a rich 300–500 word embedding text + normalized metadata |
| **Weaviate Client** | `src/weaviate_client.py` | Creates/manages the `ProductSubstitute` collection; handles batch insert and `nearText` queries with optional `scraped` filter |
| **Local Store** | `src/local_store.py` | JSON file (`target_index.json`) acting as a local cache mapping `reference → {embedding_text, original_product}` |
| **Indexer** | `src/indexer.py` | Orchestrates ingestion: normalize → deduplicate → parallel LLM preprocessing → batch insert to Weaviate + Local Store |
| **Scraper** | `src/scrape_searches.py` | Searches expert.at, e-tec.at, electronic4you.at; extracts product data from JSON-LD, Open Graph meta, Nuxt scripts, and HTML attributes |
| **Searcher** | `src/searcher.py` | Preprocesses source product then queries Weaviate `nearText`; enriches results from Local Store |
| **Reranker** | `src/reranker.py` | GPT-4o call that selects genuine substitutes from Weaviate candidates using domain-specific criteria |
| **Batch Matcher** | `src/batch_match.py` | Runs all source products through search + rerank in sequence; writes incremental JSON output |
| **API** | `src/api.py` | FastAPI backend with `/analyze` (structured), `/chat` (conversational), and `/suggestions` (fast local search) endpoints |
| **CLI** | `src/main.py` | Command-line interface for `index` and `search` operations |
| **Frontend** | `frontend/` | Next.js 15 + TypeScript + Tailwind chat/search UI |

---

## Data Flow — Indexing

```
JSON file
  └─► normalize (scraped format or standard)
        └─► deduplicate (skip existing references)
              └─► [parallel] GPT-4o preprocessing
                    └─► embedding_text + metadata
                          ├─► Weaviate (vector + scraped flag)
                          └─► LocalStore (JSON on disk)
```

## Data Flow — Batch Matching

```
source_products_*.json
  └─► for each product:
        ├─► GPT-4o: generate source embedding_text
        ├─► Weaviate nearText (scraped=False) → top-K db candidates
        ├─► Weaviate nearText (scraped=True)  → top-K scraped candidates
        ├─► GPT-4o rerank db candidates      → top-N/2
        ├─► GPT-4o rerank scraped candidates → top-N/2
        └─► write match_results_*.json + match_results_*_scraped.json
```

## Data Flow — Chat API

```
User message
  └─► GPT-4o intent detection (search / ask_price / chat)
        ├─► "chat"      → direct reply
        ├─► "ask_price" → clarification request
        └─► "search"
              ├─► GPT-4o: parse product description
              ├─► Weaviate nearText → candidates
              ├─► GPT-4o rerank
              └─► structured JSON response to frontend
```

---

## Key Design Decisions

- **Two-bucket index**: Products are tagged `scraped=True/False` in Weaviate, enabling separate retrieval and quota control for visible-retailer vs. scraped results.
- **Chunked parallel indexing**: LLM calls run in a `ThreadPoolExecutor` per chunk, with incremental flush to Weaviate after each chunk — preserves progress on failure.
- **Local Store as cache**: Avoids re-fetching full product data from Weaviate on every query; stores `embedding_text` and the full original product JSON needed for reranking.
- **OpenRouter as LLM gateway**: Single API key routes to GPT-4o; model configured centrally in `config.py`.
- **Weaviate `text2vec` vectorizer**: Embedding is handled by Weaviate Cloud directly from `embedding_text` — no local embedding model needed.
