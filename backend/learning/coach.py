"""Coach Hoops: three friendly bullets about a season review.

Server-side only. With GEMINI_API_KEY set (in .env), Gemini rephrases the
structured insights; without a key, or if the call fails or takes longer than
COACH_TIMEOUT_S, a template builds the bullets from the same insights. Either
way the facts come from learning/insights.py, never from the model.

What is sent to Gemini: rule ids, titles, H$ amounts and the summary numbers.
Never usernames, user ids, tokens or keys. Answers are cached per subject per
market day. Not financial advice, and the prompt says so.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
from typing import Any

from .currency import hoop, pnl

log = logging.getLogger("learning.coach")

# Gemini rejects request deadlines under 10 s (400 INVALID_ARGUMENT), so never go below that.
COACH_TIMEOUT_S = max(10.0, float(os.environ.get("COACH_TIMEOUT_S", "12")))
DEFAULT_MODEL = "gemini-3.5-flash-lite"  # fast (~1-2 s) and cheapest; 2.5-flash is closed to new keys, 3.8-flash took >10 s
SYSTEM = (
    "You are Coach Hoops, a cheerful basketball-themed trading coach inside HoopStreet, a game that "
    "teaches investing with virtual money (H$) on a replay of the 2024-25 NBA season. Write exactly 3 short "
    "bullets (max 25 words each) for a beginner, plain English, a little playful, weather-flavoured is fine. "
    "Use only the facts given and copy money amounts exactly as written (H$, small numbers: a player starts with H$100). "
    "Never give real financial advice, never mention real money or real brokers, "
    "and never add medical details about players."
)

_cache: dict[str, dict] = {}


def facts_for(review: dict, comparison: dict | None = None) -> dict:
    """The only data that leaves the server: rules, numbers and lessons. No identities."""
    s = review["summary"]
    # Money goes out already formatted in the UI's denomination (H$100 start), never as raw ledger units.
    facts: dict[str, Any] = {
        # Percentages as text too, so -0.2 can't be read as -20%.
        "starting_cash": hoop(100_000), "season_return": f"{s['return_pct']:+.2f}%", "payouts": hoop(s["payouts"]),
        "fees": hoop(s["fees"]), "trades": s["trades"],
        "diversification_grade": s["grade"], "biggest_drop": f"{s['max_drawdown_pct']:.2f}%",
        "biggest_lesson": s["biggest_lesson"],
        "insights": [{"rule": i["id"], "tone": i["tone"], "title": i["title"], "impact": pnl(i["impact"]),
                      "next_time": i["next_time"]} for i in review["insights"][:6]],
    }
    if comparison:
        facts["compared_with_rival"] = comparison
    return facts


def template_bullets(review: dict, comparison: dict | None = None) -> list[str]:
    bullets: list[str] = []
    if comparison and comparison.get("differences"):
        bullets.extend(comparison["differences"][:2])
    for ins in review["insights"]:
        if len(bullets) >= 3:
            break
        if ins["tone"] == "warning":
            bullets.append(f"{ins['title']}. Next time: {ins['next_time']}")
        else:
            bullets.append(f"Nice one: {ins['title']}. {ins['next_time']}")
    s = review["summary"]
    if len(bullets) < 3:
        bullets.append(f"You're at {s['return_pct']:+.2f}% for the season, with {hoop(s['payouts'])} in game payments and {hoop(s['fees'])} in fees.")
    if len(bullets) < 3:
        bullets.append("Check injury news before you buy: a listing on the official report often comes before the price drops.")
    if len(bullets) < 3:
        bullets.append("Spread your money across players and teams so one bad night can't sink everything.")
    return bullets[:3]


def _parse(text: str) -> list[str]:
    lines = [ln.strip().lstrip("-*•0123456789. ").strip() for ln in text.splitlines()]
    return [ln for ln in lines if ln][:3]


async def _gemini(facts: dict) -> list[str] | None:
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        return None
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        log.warning("google-genai not installed; using template coach")
        return None

    def call() -> str:
        client = genai.Client(api_key=key, http_options=types.HttpOptions(timeout=int(COACH_TIMEOUT_S * 1000)))
        response = client.models.generate_content(
            model=os.environ.get("GEMINI_MODEL", DEFAULT_MODEL),
            contents="Season facts as JSON:\n" + json.dumps(facts),
            config=types.GenerateContentConfig(system_instruction=SYSTEM, temperature=0.5, max_output_tokens=300),
        )
        return response.text or ""

    try:
        text = await asyncio.wait_for(asyncio.to_thread(call), timeout=COACH_TIMEOUT_S)
    except Exception as exc:  # timeout, network, quota, bad key...
        log.warning("Coach Hoops fell back to the template: %s %s", type(exc).__name__, str(exc)[:160])
        return None
    bullets = _parse(text)
    return bullets if len(bullets) == 3 else None


async def coach(subject: str, day: int, review: dict, comparison: dict | None = None) -> dict:
    """{"bullets": [3 strings], "source": "gemini" | "template"}; cached per subject and market day."""
    facts = facts_for(review, comparison)
    digest = hashlib.sha256(json.dumps(facts, sort_keys=True).encode()).hexdigest()[:16]
    key = f"{subject}|{day}|{digest}"
    if key in _cache:
        return _cache[key]
    bullets = await _gemini(facts)
    if bullets:
        result = {"bullets": bullets, "source": "gemini"}
        _cache[key] = result  # only real answers are cached; a failed call can be retried
        return result
    return {"bullets": template_bullets(review, comparison), "source": "template"}
