import json
import openai
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


_PROMPT_OPEN = """You are a product substitute matching expert. Given a source product and a numbered list of candidate products, select the candidates that are genuine substitutes for the source product.

A genuine substitute:
- Belongs to the same product subcategory (e.g., flat-screen TV matches flat-screen TV, not a soundbar)
- Has the same or very similar screen size / capacity / key dimension (within ~10%)
- Has the same display technology (QLED matches QLED, OLED matches OLED, LED matches LED)
- Has the same resolution tier (4K matches 4K, Full HD matches Full HD)
- Is in a broadly comparable price range (within ~50%)

Be INCLUSIVE rather than selective. When in doubt, include the candidate — finding more correct matches is more valuable than avoiding borderline ones. Aim for 10 results but include more if they qualify.

Return JSON with a single key "ranking" containing an array of candidate IDs (integers) ordered from best to worst substitute.
Example: {"ranking": [3, 12, 7, 1, 25, 8, 4, 19, 6, 11]}"""

_PROMPT_EXACT = """You are a product substitute matching expert. Given a source product and a numbered list of candidate products, return EXACTLY {n} substitutes.

A genuine substitute:
- Belongs to the same product subcategory (e.g., flat-screen TV matches flat-screen TV, not a soundbar)
- Has similar key specifications (screen size, resolution, type, features)
- Is in a comparable price range
- Could realistically replace the source product for a customer

Rank the best {n} candidates from most to least suitable. You MUST return exactly {n} IDs — no more, no less.

Return JSON with a single key "ranking" containing an array of exactly {n} candidate IDs (integers) ordered from best to worst.
Example: {{"ranking": [3, 12, 7, 1, 5, 8, 2, 9, 4, 6]}}"""


def rerank(
    source_text: str,
    candidates: list[dict],
    exact_n: int | None = None,
    additional_constraints: str | None = None,
) -> list[dict]:
    """Rerank candidates using GPT-4o.

    Args:
        source_text: embedding_text of the source product
        candidates: list of candidate dicts (must have 'embedding_text' field)
        exact_n: if set, prompt the model to return exactly this many results
        additional_constraints: extra filter instructions appended to the user message

    Returns:
        Reranked list of candidate dicts with 'rerank_position' added
    """
    if not candidates:
        return []

    valid = [(i, c) for i, c in enumerate(candidates) if c.get("embedding_text")]
    if not valid:
        return []

    candidate_lines = [
        f"[{rank_idx + 1}] {c['embedding_text']}"
        for rank_idx, (_, c) in enumerate(valid)
    ]

    if exact_n is not None:
        system_prompt = _PROMPT_EXACT.format(n=exact_n)
        user_suffix = f"Return exactly {exact_n} candidate IDs, ordered best to worst."
    else:
        system_prompt = _PROMPT_OPEN
        user_suffix = "Return the IDs of all candidates that qualify as genuine substitutes, ordered best to worst. Be inclusive — when in doubt, include the candidate."

    constraint_block = f"\n\nADDITIONAL CONSTRAINTS:\n{additional_constraints}" if additional_constraints else ""

    user_message = f"""SOURCE PRODUCT:
{source_text}

CANDIDATES:
{chr(10).join(candidate_lines)}
{constraint_block}
{user_suffix}"""

    client = _get_client()
    mode = f"exactly {exact_n}" if exact_n is not None else "confidence-filtered"
    print(f"Reranking {len(valid)} candidates with GPT-4o ({mode})...")

    response = client.chat.completions.create(
        model=config.OPENAI_MODEL,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
    )

    data = json.loads(response.choices[0].message.content.strip())
    ranked_ids = data.get("ranking", [])

    id_to_candidate = {rank_idx + 1: c for rank_idx, (_, c) in enumerate(valid)}

    reranked = []
    seen = set()
    for position, candidate_id in enumerate(ranked_ids):
        if candidate_id in id_to_candidate and candidate_id not in seen:
            candidate = dict(id_to_candidate[candidate_id])
            candidate["rerank_position"] = position + 1
            reranked.append(candidate)
            seen.add(candidate_id)

    return reranked
