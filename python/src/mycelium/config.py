from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass
class Config:
    store_path: str = "./.mycelium"
    decay_days: int = 14
    min_confidence: float = 0.6
    max_hints: int = 10


def load_config() -> Config:
    return Config(
        store_path=os.environ.get("MYCELIUM_STORE_PATH", "./.mycelium"),
    )


config = load_config()
