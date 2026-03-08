# Zenline Competitor Discovery

**Built by Niklas Britz, Leander Diaz-Bone, and Tilman Otto** for the Antrophic Hackathon 2026 in Zurich. (And we won.🏆)

---

## The Problem

Picture a category manager at an Austrian electronics retailer. Every morning she opens a spreadsheet with hundreds of products — TVs, soundbars, washing machines — and wonders: _what are my competitors charging for the same thing?_

She knows the LG OLED55C31LA on her shelf. But what's Expert AT listing it for? Is Cyberport offering a close alternative at a lower price? Is e-tec.at even carrying it?

Answering that manually — crawling retailer sites, matching product names that never quite line up, comparing specs across inconsistent data formats — would take a team of people days. And the prices will have changed by the time they're done.

That's the problem we set out to solve.

---

## What We Built

A fully automated competitor product matching system. Give it your product catalog. It scrapes rival Austrian retailers, finds every equivalent product, and ranks the matches — all without a human in the loop.

The result lands in a structured JSON file ready to submit to the Zenline scoring system, or you can explore matches interactively through a conversational chat interface.

---

## The Customer Journey

**Step 1 — Upload your catalog.**
Drop in a `source_products_*.json` file from the Zenline data explorer. Your products are the starting point.

**Step 2 — Index the target pool.**
Run the indexer against the provided competitor target pool. Each product gets enriched by GPT-4o into a rich semantic description — not just a product name, but a 300–500 word embedding text that captures screen size, display technology, resolution tier, price bracket, and more in both German and English. These descriptions go into Weaviate, a cloud vector database.

**Step 3 — Scrape the hidden retailers.**
The scraper fans out to expert.at, e-tec.at, and electronic4you.at. It searches each site by product name, follows the result links, and extracts structured data from JSON-LD, Open Graph meta tags, and Nuxt-embedded JavaScript. The scraped products get indexed into the same Weaviate collection, tagged separately so we can control retrieval from each bucket independently.

**Step 4 — Match.**
For every source product, we run the full matching pipeline: GPT-4o turns the source product into an embedding query, Weaviate retrieves the top-K semantic neighbours from both buckets, and then a second GPT-4o call reranks them against strict substitutability criteria — same subcategory, similar size and specs, comparable price range.

**Step 5 — Explore or submit.**
Results land in a JSON file. Or spin up the FastAPI backend and the Next.js chat UI, describe a product in plain language, and get ranked competitor matches back in seconds.

---

## Architecture

See [architecture.md](./architecture.md) for the full diagram. In brief:

```
Data Sources (target pool JSON + scraped retailer HTML)
        │
        ▼
Indexing Pipeline
  GPT-4o semantic enrichment  →  Weaviate vector DB + local JSON cache
        │
        ▼
Matching Pipeline
  GPT-4o source enrichment  →  Weaviate nearText search  →  GPT-4o reranking
        │
        ▼
Interfaces:  REST API  |  Next.js Chat UI  |  CLI  |  Batch runner
```

---

## Project Structure

```
src/
  preprocessor.py       # GPT-4o: raw product → rich embedding text + metadata
  indexer.py            # Ingest JSON files into Weaviate + local store
  searcher.py           # Preprocess source product, query Weaviate
  reranker.py           # GPT-4o: filter and rank candidates
  batch_match.py        # Process all source products in one run
  scrape_searches.py    # Crawl expert.at / e-tec.at / electronic4you.at
  scrape_source_products.py
  weaviate_client.py    # Weaviate Cloud connection, collection, queries
  local_store.py        # JSON-backed cache: reference → embedding + product data
  api.py                # FastAPI: /analyze, /chat, /suggestions

frontend/               # Next.js 15 + TypeScript + Tailwind chat UI
config.py               # API keys, collection name, defaults
```

---

## Quickstart

### Prerequisites

- Python 3.11+
- Node.js 18+ (for the frontend)
- A `.env` file with:

```
OPENROUTER_API_KEY=...
WEAVIATE_URL=...
WEAVIATE_API_KEY=...
```

### 1. Install dependencies

```bash
pip install -r requirements.txt
cd frontend && npm install
```

### 2. Index the target pool

```bash
python -m src.main index --file target_pool_tv_\&_audio.json --reset
```

### 3. Scrape hidden retailers and index scraped products

```python
from src.scrape_searches import scrape_searches
scrape_searches(["LG OLED55C31LA", "Samsung UE65DU7170"])
```

```bash
python -m src.main index --file all_products.json --scraped
```

### 4. Run batch matching (all source products)

```bash
python -m src.batch_match \
  --source source_products_tv_\&_audio.json \
  --output match_results_tv_audio.json
```

Produces `match_results_tv_audio.json` (target pool matches) and `match_results_tv_audio_scraped.json` (scraped matches).

### 5. Start the API and frontend

```bash
# Backend
uvicorn src.api:app --reload

# Frontend (separate terminal)
cd frontend && npm run dev
```

Open `http://localhost:3000` and start searching.

### 6. CLI search (single product)

```bash
# By product reference
python -m src.main search \
  --reference P_0A7A0D68 \
  --source source_products_tv_\&_audio.json

# By free text
python -m src.main search --text "Samsung 65 Zoll 4K QLED unter 800 Euro"
```

---

## How the Matching Works

### LLM-enriched embeddings

Raw product data — inconsistent names, missing specs, varying formats across retailers — makes naive string or even vector matching unreliable. Instead, we use GPT-4o to expand each product into a structured 300–500 word description before embedding. The prompt instructs the model to lead with the most discriminative attributes (screen size, display technology, resolution) repeated multiple times in German and English, so that semantically equivalent products land close together in vector space even when their raw names look nothing alike.

### Two-pass retrieval + reranking

Weaviate's `nearText` gives us the top-K semantic neighbours quickly. But semantic similarity is not the same as substitutability — a 65" QLED and a 65" soundbar might share embedding space. The second GPT-4o pass is given the source product description and the candidate list, and asked to select only genuine substitutes: same product subcategory, comparable size (within ~10%), same display technology, same resolution tier, similar price bracket (within ~50%). This two-pass approach keeps latency low while ensuring precision.

### Two-bucket index

Known-retailer products (from the Zenline target pool) and scraped products (from our crawler) are stored in the same Weaviate collection but tagged with a `scraped` boolean. Batch matching queries each bucket separately so we always return matches from both sources, regardless of which bucket happens to be more populated.

---

## Retailers Covered

| Retailer           | Type    | Method                      |
| ------------------ | ------- | --------------------------- |
| Visible Retailer A | Known   | Target pool JSON            |
| Visible Retailer B | Known   | Target pool JSON            |
| expert.at          | Scraped | Search + product page crawl |
| e-tec.at           | Scraped | Search + product page crawl |
| electronic4you.at  | Scraped | Search + product page crawl |

---

## Team

- **Niklas Britz**
- **Leander Diaz-Bone**
- **Tilman Otto**
