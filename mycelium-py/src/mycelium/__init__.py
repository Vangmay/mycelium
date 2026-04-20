"""Mycelium — self-improving memory layer for TinyFish web agents."""

from .prime import build_goal, prime
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
]

__version__ = "0.1.0"
