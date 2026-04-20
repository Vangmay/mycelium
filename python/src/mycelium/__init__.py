"""Mycelium — self-improving memory layer for TinyFish web agents."""

from .prime import build_goal, prime
from .recorder import record
from .runner import run
from .types import (
    DomainStore,
    Hint,
    HintType,
    PrimeResult,
    RecordResult,
    RunHistoryEntry,
    RunOutcome,
    RunResult,
)

__all__ = [
    "DomainStore",
    "Hint",
    "HintType",
    "PrimeResult",
    "RecordResult",
    "RunHistoryEntry",
    "RunOutcome",
    "RunResult",
    "build_goal",
    "prime",
    "record",
    "run",
]

__version__ = "0.1.0"
