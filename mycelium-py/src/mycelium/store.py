from __future__ import annotations

import json
import os
import uuid
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast

from .config import config
from .types import DomainStore, Hint, HintType, RunHistoryEntry


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def store_path(domain: str) -> Path:
    return Path(config.store_path) / f"{domain}.json"


def empty_store(domain: str) -> DomainStore:
    return DomainStore(
        domain=domain,
        updated=_now_iso(),
        runs=0,
        success_rate=0.0,
        hints=[],
        history=[],
    )


def _hint_from_json(d: dict[str, Any]) -> Hint:
    return Hint(
        id=d["id"],
        type=cast(HintType, d["type"]),
        note=d["note"],
        action=d["action"],
        confidence=float(d["confidence"]),
        seen=int(d.get("seen", 1)),
        last=d.get("last", _today()),
    )


def _history_from_json(d: dict[str, Any]) -> RunHistoryEntry:
    return RunHistoryEntry(
        ts=d["ts"],
        goal=d["goal"],
        success=bool(d["success"]),
        hints_used=int(d.get("hintsUsed", 0)),
        hints_added=int(d.get("hintsAdded", 0)),
        duration_ms=d.get("durationMs"),
    )


def _store_from_json(d: dict[str, Any]) -> DomainStore:
    return DomainStore(
        domain=d["domain"],
        updated=d.get("updated", _now_iso()),
        runs=int(d.get("runs", 0)),
        success_rate=float(d.get("successRate", 0.0)),
        hints=[_hint_from_json(h) for h in d.get("hints", [])],
        history=[_history_from_json(h) for h in d.get("history", [])],
    )


def _history_to_json(h: RunHistoryEntry) -> dict[str, Any]:
    out: dict[str, Any] = {
        "ts": h.ts,
        "goal": h.goal,
        "success": h.success,
        "hintsUsed": h.hints_used,
        "hintsAdded": h.hints_added,
    }
    if h.duration_ms is not None:
        out["durationMs"] = h.duration_ms
    return out


def _store_to_json(store: DomainStore) -> dict[str, Any]:
    return {
        "domain": store.domain,
        "updated": store.updated,
        "runs": store.runs,
        "successRate": store.success_rate,
        "hints": [asdict(h) for h in store.hints],
        "history": [_history_to_json(h) for h in store.history],
    }


def read_store(domain: str) -> DomainStore:
    path = store_path(domain)
    if not path.exists():
        return empty_store(domain)
    try:
        return _store_from_json(json.loads(path.read_text(encoding="utf-8")))
    except (json.JSONDecodeError, KeyError, ValueError):
        return empty_store(domain)


def write_store(store: DomainStore) -> None:
    os.makedirs(config.store_path, exist_ok=True)
    path = store_path(store.domain)
    path.write_text(json.dumps(_store_to_json(store), indent=2), encoding="utf-8")


def apply_decay(store: DomainStore) -> DomainStore:
    now = datetime.now(timezone.utc)
    decay_seconds = config.decay_days * 24 * 60 * 60
    for hint in store.hints:
        try:
            last = datetime.strptime(hint.last, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        age = (now - last).total_seconds()
        if age > decay_seconds:
            hint.confidence = hint.confidence * 0.5
    return store


_TYPE_PRIORITY: dict[str, int] = {
    "flow": 0,
    "blocker": 1,
    "auth": 2,
    "timing": 3,
    "selector": 4,
    "failure": 5,
    "rate_limit": 6,
}

_MAX_PER_TYPE: dict[str, int] = {
    "flow": 2,
    "timing": 1,
    "failure": 2,
    "blocker": 1,
    "auth": 1,
    "selector": 1,
    "rate_limit": 1,
}

_DELAY_WORDS = ("waits", "wait", "delays", "delay", "longer", "pause", "sleep")


def _is_slow_timing(hint: Hint) -> bool:
    if hint.type != "timing":
        return False
    text = hint.action.lower()
    return any(f" {w} " in f" {text} " or text.startswith(f"{w} ") for w in _DELAY_WORDS)


def filter_hints(store: DomainStore, goal: str | None = None) -> list[Hint]:
    import re

    goal_words: set[str] = set()
    if goal:
        goal_words = {w for w in re.split(r"\W+", goal.lower()) if len(w) > 3}

    eligible = [h for h in store.hints if h.confidence >= config.min_confidence]

    scored: list[tuple[Hint, float]] = []
    for h in eligible:
        if _is_slow_timing(h):
            continue
        text = f"{h.note} {h.action}".lower()
        if goal_words:
            overlap = sum(1 for w in goal_words if w in text) / len(goal_words)
        else:
            overlap = 0.0
        scored.append((h, h.confidence + overlap * 0.2))

    by_type: dict[str, list[tuple[Hint, float]]] = {}
    for hint, score in scored:
        by_type.setdefault(hint.type, []).append((hint, score))

    selected: list[tuple[Hint, float]] = []
    for t, entries in by_type.items():
        limit = _MAX_PER_TYPE.get(t, 1)
        entries.sort(key=lambda e: e[1], reverse=True)
        selected.extend(entries[:limit])

    selected.sort(
        key=lambda e: (_TYPE_PRIORITY.get(e[0].type, 99), -e[1])
    )

    return [e[0] for e in selected[:6]]


def merge_hints(store: DomainStore, new_hints: list[dict[str, Any]]) -> DomainStore:
    today = _today()
    for incoming in new_hints:
        in_type = incoming.get("type")
        in_note = (incoming.get("note") or "").lower()
        in_action = incoming.get("action") or ""
        in_conf = float(incoming.get("confidence", 0.65))

        match: Hint | None = None
        for h in store.hints:
            if h.type != in_type:
                continue
            h_note = h.note.lower()
            if h_note.startswith(in_note[:20]) or in_note.startswith(h_note[:20]):
                match = h
                break
            if in_note[:20] in h_note or h_note[:20] in in_note:
                match = h
                break

        if match:
            match.seen += 1
            match.last = today
            match.confidence = min(0.99, match.confidence + 0.05)
            if len(in_action) > len(match.action):
                match.action = in_action
        else:
            store.hints.append(
                Hint(
                    id=uuid.uuid4().hex[:8],
                    type=cast(HintType, in_type),
                    note=incoming.get("note", ""),
                    action=in_action,
                    confidence=in_conf,
                    seen=1,
                    last=today,
                )
            )

    store.updated = _now_iso()
    return store


def update_run_stats(
    store: DomainStore,
    success: bool,
    *,
    goal: str,
    hints_used: int,
    hints_added: int,
    duration_ms: int | None = None,
) -> DomainStore:
    runs = store.runs + 1
    prev_total = store.success_rate * store.runs
    store.success_rate = (prev_total + (1 if success else 0)) / runs
    store.runs = runs
    store.history.append(
        RunHistoryEntry(
            ts=_now_iso(),
            goal=goal,
            success=success,
            hints_used=hints_used,
            hints_added=hints_added,
            duration_ms=duration_ms,
        )
    )
    return store
