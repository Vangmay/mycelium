# mycelium-sdk (Python)

Self-improving memory layer for TinyFish web agents. Python port of the JS SDK — reads and writes the same `.mycelium/<domain>.json` format, so both SDKs can share one knowledge store.

## Install

```bash
pip install mycelium-sdk        # once published to PyPI
# or locally:
pip install -e ./mycelium-py
```

## Environment

```bash
TINYFISH_API_KEY=   # required for real runs
OPENAI_API_KEY=     # required for hint extraction
MYCELIUM_MOCK=1     # skip both APIs and simulate deterministically
```

## Basic usage — drop-in TinyFish replacement

```python
from dotenv import load_dotenv
load_dotenv()

from mycelium import run

result = run("amazon.com", "find the price of Kindle Paperwhite")

print(result.data)                      # TinyFish response
print(result.primed.hints_loaded)       # hints injected this run
print(result.recorded.hints_extracted)  # new hints saved
print(result.recorded.hints_total)      # total hints in store
```

## Advanced — manual control

```python
from mycelium import prime, record, build_goal, RunOutcome

ctx = prime("amazon.com", goal="find Kindle price")
enriched_goal = build_goal("find Kindle price", ctx)

# ...your own TinyFish call...

recorded = record(RunOutcome(
    domain="amazon.com",
    goal="find Kindle price",
    success=True,
    steps=["navigated", "clicked", "extracted"],
    errors=[],
    raw=raw_response_text,
))
```

## Store location

Defaults to `./.mycelium/` relative to cwd (matches the JS SDK). Override with:

```bash
MYCELIUM_STORE_PATH=/absolute/path
```

Point both SDKs at the same path to share one knowledge base across JS and Python agents.
