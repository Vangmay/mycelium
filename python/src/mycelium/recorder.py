from __future__ import annotations

import json
import os
import re
from typing import Any

from .store import apply_decay, merge_hints, read_store, update_run_stats, write_store
from .types import RecordResult, RunOutcome

_EXTRACT_SYSTEM = """You are an expert at extracting reusable web automation hints from agent run logs.
Given a TinyFish web agent run result, extract a JSON array of hints that would help future runs succeed.

Each hint must follow this schema:
{
  "type": "blocker" | "selector" | "timing" | "flow" | "failure" | "auth" | "rate_limit",
  "note": "concise description of what was learned (max 100 chars)",
  "action": "specific instruction for the agent to follow (max 150 chars)",
  "confidence": 0.65
}

Hint type guide:
- "blocker"    = cookie banners, login walls, popups that must be dismissed first
- "selector"   = stable CSS selectors or element identifiers worth remembering
- "timing"     = elements that lazy-load or require waits before interacting
- "flow"       = multi-step navigation patterns that work reliably
- "failure"    = patterns that caused failures and must be avoided next time
- "auth"       = login or session flow steps (navigation steps ONLY — never store credentials)
- "rate_limit" = throttling signals and delays that helped avoid blocks

Rules:
- Only extract hints that are domain-specific and reusable across sessions
- Hints must describe site behaviour, NOT the specific goal or search query — strip all goal-specific
  details (names, topics, search terms). A hint must apply to ANY future goal on this domain.
  BAD:  "Use DuckDuckGo to find Elon Musk tweets"
  GOOD: "X.com login wall blocks all direct access — use DuckDuckGo to find Twitter content"
- If the run succeeded cleanly with no notable patterns, return []
- If the run took a long time (>60s) and the agent tried multiple approaches before one worked,
  extract a "flow" hint describing the shortcut that eventually succeeded — so future runs skip
  the failed attempts and go straight to what worked (e.g. "use DuckDuckGo instead of site search")
- Return ONLY valid JSON — no markdown, no explanation"""


def _extract_hints_via_openai(summary: str) -> list[dict[str, Any]]:
    try:
        from openai import OpenAI
    except ImportError as e:
        raise RuntimeError("openai package not installed; run `pip install openai`") from e

    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=800,
            messages=[
                {"role": "system", "content": _EXTRACT_SYSTEM},
                {"role": "user", "content": summary},
            ],
        )
        text = resp.choices[0].message.content or "[]"
        if os.environ.get("MYCELIUM_DEBUG"):
            print("[RECORDER GPT]", text)
        cleaned = re.sub(r"```json|```", "", text).strip()
        parsed = json.loads(cleaned)
        return parsed if isinstance(parsed, list) else []
    except Exception as e:
        if os.environ.get("MYCELIUM_DEBUG"):
            print("[RECORDER ERROR]", e)
        return []


def record(outcome: RunOutcome) -> RecordResult:
    duration_sec = (outcome.duration_ms // 1000) if outcome.duration_ms else None
    duration_note = ""
    if duration_sec is not None:
        suffix = " (SLOW — agent tried multiple approaches)" if duration_sec > 60 else ""
        duration_note = f"Duration: {duration_sec}s{suffix}"

    summary_lines = [
        f"Domain: {outcome.domain}",
        f"Goal: {outcome.goal}",
        f"Outcome: {'SUCCESS' if outcome.success else 'FAILURE'}",
    ]
    if duration_note:
        summary_lines.append(duration_note)
    summary_lines.append(f"Steps completed: {' → '.join(outcome.steps) or 'none'}")
    if outcome.errors:
        summary_lines.append(f"Errors: {'; '.join(outcome.errors)}")
    summary_lines.append(f"Agent response excerpt:\n{outcome.raw[:2000]}")
    summary = "\n".join(summary_lines)

    new_hints = _extract_hints_via_openai(summary)

    store = apply_decay(read_store(outcome.domain))
    hints_used = sum(1 for h in store.hints if h.confidence >= 0.6)

    store = merge_hints(store, new_hints)
    store = update_run_stats(
        store,
        outcome.success,
        goal=outcome.goal,
        hints_used=hints_used,
        hints_added=len(new_hints),
        duration_ms=outcome.duration_ms,
    )
    write_store(store)

    return RecordResult(hints_extracted=len(new_hints), hints_total=len(store.hints))
