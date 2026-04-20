from __future__ import annotations

from .store import apply_decay, filter_hints, read_store
from .types import Hint, PrimeResult

_STOP_RULES = """RULES:
- Follow the hints above — do not rediscover what is already known
- If a hint redirects you to a different site or method, go there directly without attempting the original first
- If you hit a login wall, cookie banner, or access block that has no hint: stop and return what you have, do not retry"""


def _format_hint(h: Hint) -> str:
    conf = round(h.confidence * 100)
    prefix = f"- [SHORTCUT, {conf}% confident]" if h.type == "flow" else f"- [{conf}% confident]"
    return f"{prefix} {h.note} → {h.action}"


def prime(domain: str, goal: str | None = None) -> PrimeResult:
    store = apply_decay(read_store(domain))
    hints = filter_hints(store, goal)

    if not hints:
        return PrimeResult(domain=domain, hints_loaded=0, prompt_block="")

    lines = [_format_hint(h) for h in hints]
    prompt_block = "\n".join(
        [
            f"IMPORTANT — KNOWN HINTS FOR {domain} (follow these, do not rediscover):",
            *lines,
            "",
        ]
    )
    return PrimeResult(domain=domain, hints_loaded=len(hints), prompt_block=prompt_block)


def build_goal(original_goal: str, primed: PrimeResult) -> str:
    if not primed.prompt_block:
        return original_goal
    return f"{primed.prompt_block}\n{_STOP_RULES}\n\nTASK: {original_goal}"
