from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

HintType = Literal[
    "blocker",
    "selector",
    "timing",
    "flow",
    "failure",
    "auth",
    "rate_limit",
]


@dataclass
class Hint:
    id: str
    type: HintType
    note: str
    action: str
    confidence: float
    seen: int
    last: str  # YYYY-MM-DD


@dataclass
class RunHistoryEntry:
    ts: str  # ISO datetime
    goal: str
    success: bool
    hints_used: int
    hints_added: int
    duration_ms: int | None = None


@dataclass
class DomainStore:
    domain: str
    updated: str
    runs: int
    success_rate: float
    hints: list[Hint] = field(default_factory=list)
    history: list[RunHistoryEntry] = field(default_factory=list)


@dataclass
class RunOutcome:
    domain: str
    goal: str
    success: bool
    steps: list[str]
    errors: list[str]
    raw: str
    duration_ms: int | None = None


@dataclass
class PrimeResult:
    domain: str
    hints_loaded: int
    prompt_block: str


@dataclass
class RecordResult:
    hints_extracted: int
    hints_total: int


@dataclass
class RunResult:
    success: bool
    data: Any
    primed: PrimeResult
    recorded: RecordResult
    raw: str
