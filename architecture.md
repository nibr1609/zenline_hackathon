# System Architecture — Zenline Competitor Discovery

## Overview

An automated pipeline that finds competitor substitutes for electronics products. Given a source product, it scrapes rival retailers, indexes everything into a vector database, and uses an LLM to surface the best matches — all accessible via a chat interface.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        DATA SOURCES                         │
│                                                             │
│   Target Pool JSON          Scraped Retailer Catalogs       │
│   (known retailers)         (expert.at, e-tec.at, etc.)     │
└────────────────────────────────┬────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                      INDEXING PIPELINE                      │
│                                                             │
│   Normalize & Deduplicate                                   │
│          │                                                  │
│          ▼                                                  │
│   GPT-4o: Enrich each product into a rich semantic          │
│           description optimised for vector search           │
│          │                                                  │
│          ▼                                                  │
│   Store in Weaviate (vector DB) + local JSON cache          │
└─────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                      MATCHING PIPELINE                      │
│                                                             │
│   Source product                                            │
│          │                                                  │
│          ▼                                                  │
│   GPT-4o: Generate semantic description for source          │
│          │                                                  │
│          ▼                                                  │
│   Weaviate: Vector search → top-K candidates                │
│          │                                                  │
│          ▼                                                  │
│   GPT-4o: Rerank candidates by true substitutability        │
│           (category, size, specs, price range)              │
│          │                                                  │
│          ▼                                                  │
│   Ranked competitor matches                                 │
└─────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                         INTERFACES                          │
│                                                             │
│   REST API (FastAPI)  ──►  Next.js Chat UI                  │
│   CLI                                                       │
│   Batch runner (process all products at once)               │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Scraping

```
  Competitor Retailer Sites
  (expert.at, e-tec.at, electronic4you.at)
           │
           ▼
  HTTP Requests (rate limited)
           │
           ▼
  ┌────────────────────────────────┐
  │  Content Extraction            │
  │                                │
  │  JSON-LD structured data  ─┐  │
  │  Open Graph meta tags     ─┼─►│  Normalised product dict
  │  Nuxt/SSR embedded JSON   ─┘  │  (name, price, specs, URL)
  └────────────────────────────────┘
           │
           ▼
  all_products.json  ──►  Indexing Pipeline
```

---

## Key Components

| Layer | What it does |
|---|---|
| **Scraper** | Crawls competitor retailers and extracts product data |
| **Preprocessor** | Uses GPT-4o to turn raw product data into rich, embedding-friendly descriptions |
| **Vector Index** | Weaviate Cloud stores and searches embeddings; products are tagged as *known retailer* vs *scraped* |
| **Reranker** | A second GPT-4o pass filters and ranks candidates by genuine substitutability |
| **API + Frontend** | FastAPI backend with a Next.js chat UI for interactive product discovery |

---

## Data Flow

```
Product in  →  Semantic enrichment (GPT-4o)
            →  Vector search (Weaviate)
            →  Reranking (GPT-4o)
            →  Ranked competitor matches out
```

---

## Key Design Decisions

- **Two-bucket index** — known-retailer and scraped products are stored separately, allowing independent retrieval and quota control.
- **LLM-enriched embeddings** — raw product data is expanded into a descriptive text before embedding, dramatically improving semantic search quality.
- **Local JSON cache** — full product data is cached locally so reranking doesn't require round-trips back to the vector DB.
- **Weaviate-hosted embeddings** — vectorisation is handled by Weaviate Cloud, removing the need for a local embedding model.