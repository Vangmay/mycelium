from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

from .store import read_store

MOCK_ENABLED = os.environ.get("MYCELIUM_MOCK") == "1"


@dataclass
class MockResponse:
    success: bool
    data: Any
    steps: list[str]
    errors: list[str]
    raw: str


_DOMAIN_FRICTION: dict[str, list[str]] = {
    "amazon.com": ["cookie_banner", "lazy_price"],
    "linkedin.com": ["login_wall", "rate_limit"],
    "booking.com": ["cookie_banner", "date_picker_quirk"],
    "airbnb.com": ["cookie_banner", "auth", "rate_limit"],
    "glassdoor.com": ["login_wall", "rate_limit"],
}


def _build_raw(
    domain: str,
    goal: str,
    steps: list[str],
    errors: list[str],
    success: bool,
    data: Any,
) -> str:
    return json.dumps(
        {"domain": domain, "goal": goal, "steps": steps, "errors": errors, "success": success, "data": data},
        indent=2,
    )


def _build_mock_data(domain: str, goal: str) -> Any:
    if "amazon" in domain and "price" in goal.lower():
        return {"price": "$139.99", "asin": "B09TMF6742", "title": "Kindle Paperwhite (16 GB)"}
    if "linkedin" in domain:
        return {"results": [{"name": "Jane Smith", "title": "Senior Engineer at Acme"}]}
    return {"result": "mock data extracted successfully", "domain": domain}


def get_mock_response(domain: str, goal: str) -> MockResponse:
    store = read_store(domain)
    friction = _DOMAIN_FRICTION.get(domain, ["cookie_banner"])

    covered = [
        f
        for f in friction
        if any(
            f.split("_")[0] in h.note.lower() and h.confidence >= 0.6
            for h in store.hints
        )
    ]
    uncovered = [f for f in friction if f not in covered]

    steps: list[str] = [f"navigating to {domain}"]
    errors: list[str] = []

    if "cookie_banner" in uncovered:
        errors.append("blocked by cookie consent banner — could not proceed")
        steps.append("encountered cookie banner")
        return MockResponse(False, None, steps, errors, _build_raw(domain, goal, steps, errors, False, None))
    if "cookie_banner" in covered:
        steps.append("dismissed cookie banner using #sp-cc-accept (hint applied)")

    if "login_wall" in uncovered:
        errors.append("login wall detected — authentication required")
        return MockResponse(False, None, steps, errors, _build_raw(domain, goal, steps, errors, False, None))

    steps.append("searching for target element")

    if "lazy_price" in uncovered:
        errors.append("price element (.a-price) not found — may require additional wait")
        steps.append("extraction timeout on lazy-loaded element")
        partial = {"price": None, "note": "extraction incomplete — lazy element not awaited"}
        return MockResponse(False, partial, steps, errors, _build_raw(domain, goal, steps, errors, False, partial))
    if "lazy_price" in covered:
        steps.append("waited for lazy-loaded price element (hint applied)")

    steps.append("extracted target data successfully")
    data = _build_mock_data(domain, goal)
    return MockResponse(True, data, steps, [], _build_raw(domain, goal, steps, [], True, data))


_ERROR_HINT_MAP: list[dict[str, Any]] = [
    {
        "match": "cookie consent banner",
        "type": "blocker",
        "note": "cookie consent banner blocks navigation",
        "action": "dismiss cookie banner with #sp-cc-accept before any interaction",
    },
    {
        "match": "login wall",
        "type": "auth",
        "note": "login wall blocks access without authentication",
        "action": "detect and handle login wall before attempting data extraction",
    },
    {
        "match": "rate_limit",
        "type": "rate_limit",
        "note": "rate limiting detected — requests throttled",
        "action": "add 2–5s delay between requests to avoid rate limit blocks",
    },
    {
        "match": "lazy",
        "type": "timing",
        "note": "price element lazy-loads after initial render",
        "action": "wait for .a-price to appear in DOM before extracting price data",
    },
    {
        "match": "not found",
        "type": "timing",
        "note": "target element not immediately present — may require wait",
        "action": "wait up to 5s for target element before declaring extraction failure",
    },
]


def get_mock_hints(steps: list[str], errors: list[str]) -> list[dict[str, Any]]:
    combined = [s.lower() for s in errors + steps]
    hints: list[dict[str, Any]] = []
    for tmpl in _ERROR_HINT_MAP:
        if any(tmpl["match"] in s for s in combined):
            hints.append(
                {
                    "type": tmpl["type"],
                    "note": tmpl["note"],
                    "action": tmpl["action"],
                    "confidence": 0.65,
                }
            )
    return hints
