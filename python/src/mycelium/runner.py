from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

from .mock import MOCK_ENABLED, get_mock_response
from .prime import build_goal, prime
from .recorder import record
from .types import RunOutcome, RunResult


@dataclass
class _TinyFishResult:
    success: bool
    data: Any
    raw: str
    steps: list[str]
    errors: list[str]


def _extract_domain(url: str) -> str:
    full = url if url.startswith("http") else f"https://{url}"
    try:
        host = urlparse(full).hostname or url
    except ValueError:
        host = url
    if host.startswith("www."):
        host = host[4:]
    return host


def _call_tinyfish(url: str, goal: str, silent: bool) -> _TinyFishResult:
    try:
        import httpx
    except ImportError as e:
        raise RuntimeError("httpx package not installed; run `pip install httpx`") from e

    api_key = os.environ.get("TINYFISH_API_KEY")
    if not api_key:
        raise RuntimeError("TINYFISH_API_KEY is not set")

    full_url = url if url.startswith("http") else f"https://{url}"
    body = {"url": full_url, "goal": goal}
    headers = {"Content-Type": "application/json", "X-API-Key": api_key}

    steps: list[str] = []
    errors: list[str] = []
    raw_parts: list[str] = []
    data: Any = None
    success = False

    with httpx.Client(timeout=None) as client:
        with client.stream(
            "POST",
            "https://agent.tinyfish.ai/v1/automation/run-sse",
            headers=headers,
            json=body,
        ) as response:
            if response.status_code >= 400:
                text = response.read().decode("utf-8", errors="replace")
                raise RuntimeError(
                    f"TinyFish API error: {response.status_code} {response.reason_phrase}\n{text}"
                )

            for chunk in response.iter_text():
                if not chunk:
                    continue
                raw_parts.append(chunk)
                for line in chunk.split("\n"):
                    if not line.startswith("data: "):
                        continue
                    payload = line[6:]
                    if os.environ.get("MYCELIUM_DEBUG"):
                        print("[SSE RAW]", payload)
                    try:
                        event = json.loads(payload)
                    except json.JSONDecodeError:
                        continue
                    event_type = event.get("type")
                    if event_type == "PROGRESS" and event.get("purpose"):
                        purpose = event["purpose"]
                        steps.append(purpose)
                        if not silent:
                            sys.stdout.write(f"  · {purpose}\n")
                            sys.stdout.flush()
                    elif event_type == "FAILED" and event.get("message"):
                        errors.append(event["message"])
                    elif event_type == "COMPLETE":
                        data = event.get("result", event.get("data"))
                        success = event.get("status") == "COMPLETED"

    return _TinyFishResult(success=success, data=data, raw="".join(raw_parts), steps=steps, errors=errors)


def run(url: str, goal: str, *, silent: bool = False) -> RunResult:
    domain = _extract_domain(url)

    primed = prime(domain, goal)
    if not silent:
        if primed.hints_loaded > 0:
            plural = "s" if primed.hints_loaded > 1 else ""
            print(f"  + {primed.hints_loaded} hint{plural} loaded for {domain}")
        else:
            print(f"  no knowledge found for {domain} — starting fresh")

    enriched = build_goal(goal, primed)
    t0 = time.monotonic()
    if MOCK_ENABLED:
        mock = get_mock_response(domain, goal)
        success, data, raw, steps, errors = mock.success, mock.data, mock.raw, mock.steps, mock.errors
    else:
        tf = _call_tinyfish(url, enriched, silent)
        success, data, raw, steps, errors = tf.success, tf.data, tf.raw, tf.steps, tf.errors
    duration_ms = int((time.monotonic() - t0) * 1000)

    outcome = RunOutcome(
        domain=domain,
        goal=goal,
        success=success,
        steps=steps,
        errors=errors,
        raw=raw,
        duration_ms=duration_ms,
    )
    recorded = record(outcome)
    if not silent:
        if recorded.hints_extracted > 0:
            plural = "s" if recorded.hints_extracted > 1 else ""
            print(
                f"  + {recorded.hints_extracted} new hint{plural} saved "
                f"({recorded.hints_total} total)"
            )
        else:
            print("  no new hints extracted")

    return RunResult(success=success, data=data, primed=primed, recorded=recorded, raw=raw)
