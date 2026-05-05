# Mycelium

Self-improving memory layer for web agents. Mycelium primes any provider with domain knowledge, records the outcome, and stores reusable hints in a local graph. TinyFish is now one adapter, not the core architecture.

## Repository layout

```
.
├── js/          JavaScript / TypeScript SDK and optional local tools
├── python/      Python SDK (PyPI: "mycelium-sdk")
├── server/      Web UI that imports from ../js/
├── package.json Root scripts — all delegate to js/
└── .env         Single shared env file, loaded by both SDKs
```

The JS SDK now uses an embedded SQLite graph store. The older Python SDK still uses the previous JSON-store format.

## What this project does

Every web-agent provider call starts stateless. Mycelium fixes this with three steps per run:

1. **prime(domain, goal)** — reads the graph, applies confidence/decay, injects surviving hints into the agent's goal prompt as natural language
2. **adapter.run({ url, goal })** — calls TinyFish, Stagehand, Playwright, or another provider and returns a normalized result
3. **record(outcome)** — runs deterministic web rules plus optional LLM extraction, then writes structured hints back to the graph

The JS store is embedded SQLite plus sqlite-vec. No hosted server, no model training.

## Runtime

**Node.js + tsx** — TypeScript is executed directly via `tsx`. No compilation step for development; `npm run build` emits `dist/` for publishing.

```bash
# From the repo root (all scripts forward into js/)
npm run install:js         # install JS deps
npm run demo:mock          # offline demo, no API credits
npm run demo               # real API calls
npm run tools -- run <url> <goal>
npm run typecheck
npm run build              # produces js/dist/
```

Inside `js/` directly, the same scripts exist without the `--` hop.

## Environment

Loaded by `js/load-env.ts`, which tries `js/.env` then the repo-root `.env`. One file at the root works for both SDKs.

```bash
cp .env.example .env
```

```bash
TINYFISH_API_KEY=   # required only for the TinyFish adapter
OPENAI_API_KEY=     # optional; used when LLM extraction or OpenAI embeddings are enabled
MYCELIUM_MOCK=1     # set to skip external calls in demo/tool flows
MYCELIUM_STORE_PATH=./js/.mycelium   # override default store location
```

**Never load dotenv in library files** (`js/core/`, `js/store/`). Only entry points (`js/tools/index.ts`, `js/demo/run-demo.ts`, `server/server.ts`) load env via `load-env.ts`.

## Commands

All runnable from the repo root via `npm run …`, or from inside `js/` with the same names (without `--`):

```bash
npm run tools -- run <url> <goal>    # run with prime + record
npm run tools -- inspect <domain>    # coloured knowledge store view
npm run tools -- stats [--all]       # success rate trend
npm run tools -- history <domain>    # timestamped run timeline
npm run tools -- replay <domain>     # re-run recent goals
npm run tools -- batch <file>        # multi-domain run from JSON
npm run tools -- clear <domain>      # wipe domain store
```

## Project structure (JS)

```
js/
├── index.ts              # SDK public exports
├── mycelium.config.ts    # storePath, decayDays, minConfidence, maxHints
├── load-env.ts           # multi-path dotenv loader (js/.env + ../.env)
├── core/
│   ├── runner.ts         # run() — orchestrates prime → adapter → record
│   ├── prime.ts          # prime(), buildGoal()
│   └── recorder.ts       # record() — rule hints + optional LLM extraction
├── adapters/
│   ├── types.ts          # provider adapter contract
│   └── tinyfish.ts       # TinyFish adapter
├── analyzer/
│   └── classifier.ts     # deterministic web automation symptoms → hints
├── store/
│   ├── types.ts          # Hint, RunOutcome
│   └── graph/            # SQLite graph, traversal, embeddings, queries
├── tools/                # optional local inspection/debugging wrappers
├── demo/                 # 5-session hackathon demo arc
├── examples/             # basic-sdk.ts, advanced-sdk.ts, basic-cli.sh, batch-tasks.json
└── .mycelium/            # default store location for dev
```

## Project structure (Python)

```
python/
├── pyproject.toml
├── README.md
└── src/mycelium/
    ├── __init__.py        # run, prime, record, build_goal, types
    ├── runner.py          # run() + SSE call via httpx
    ├── prime.py           # prime(), build_goal()
    ├── recorder.py        # record() — OpenAI extraction
    ├── store.py           # read_store, apply_decay, filter_hints, merge_hints, ...
    ├── mock.py            # get_mock_response, get_mock_hints
    ├── types.py           # Hint, DomainStore, RunOutcome dataclasses
    └── config.py          # Config + MYCELIUM_STORE_PATH env override
```

Public surface mirrors the older JS SDK shape, but attribute names are snake_case (`hints_loaded`, `hints_extracted`, `hints_total`, `duration_ms`).

## Key types

```typescript
// js/store/types.ts
type HintType = "blocker" | "selector" | "timing" | "flow" | "failure" | "auth" | "rate_limit"

interface Hint {
  id: string
  type: HintType
  note: string          // max 100 chars
  action: string        // max 150 chars — what the agent should do
  confidence: number    // 0.0 – 1.0, starts at 0.65, max 0.99
  seen: number          // confirmed run count
  last: string          // YYYY-MM-DD
}

interface DomainStore {
  domain: string
  updated: string       // ISO datetime
  runs: number
  successRate: number   // 0.0 – 1.0, rolling average
  hints: Hint[]
  history: RunHistoryEntry[]
}

interface RunHistoryEntry {
  ts: string            // ISO datetime
  goal: string
  success: boolean
  hintsUsed: number
  hintsAdded: number
  durationMs?: number
}
```

## Confidence mechanics

- New hint starts at **0.65**
- Each confirmed run adds **+0.05** (capped at 0.99)
- Not seen in `decayDays` (default 14) → confidence **halved** on next `prime()` call
- Only hints with confidence ≥ `minConfidence` (default 0.6) are injected
- Max `maxHints` (default 10) hints injected per session

Trust is slow to earn, quick to lose. Stale selectors should stop being injected without manual intervention.

## Mock mode

`MYCELIUM_MOCK=1` is kept for demo/tool flows that need to avoid external provider calls. The modern JS runtime is adapter-based, so provider-specific mocking belongs at the adapter boundary.

## TinyFish adapter SSE parsing

TinyFish streams responses as server-sent events. `tinyfishAdapter()` in `js/adapters/tinyfish.ts` parses them:

```typescript
event.type === "PROGRESS"  // agent navigation step — event.purpose
event.type === "FAILED"    // agent error — event.message
event.type === "COMPLETE"  // final extracted data — event.result or event.data
```

Set `MYCELIUM_DEBUG=1` to print raw SSE lines if a real run returns no data.

## Store file location

Default `./.mycelium/` relative to cwd. Override via `MYCELIUM_STORE_PATH`. The existing dev data lives at `js/.mycelium/`, so running from `js/` (or via the root-level npm scripts, which chain into `js/`) picks it up automatically.

## Adding a new local tool command

1. Create `js/tools/<name>.ts` — export `async function cmd<Name>(args) {}`
2. Import and register in `js/tools/index.ts` using `program.command(...).action(cmd<Name>)`
3. Implement using existing `js/core/` and `js/store/` functions — no product logic in the tool wrapper

## Adding a new hint type

1. Add the new type to the `HintType` union in `js/store/types.ts` **and** the `HintType` literal in `python/src/mycelium/types.py`
2. Add a description line to the `EXTRACT_SYSTEM` prompt in `js/core/recorder.ts` and `python/src/mycelium/recorder.py`
3. Add a colour entry in `js/tools/inspect.ts` TYPE_COLOURS map
4. Add a friction entry in `js/core/mock.ts` MOCK_HINTS (and `python/src/mycelium/mock.py`) if you want mock support

## SDK usage

```typescript
import { run } from "mycelium"
const result = await run({ url: "amazon.com", goal: "find Kindle price" })
// result.primed    — { hintsLoaded, promptBlock }
// result.recorded  — { hintsExtracted, hintsTotal }
```

```python
from mycelium import run
result = run("amazon.com", "find Kindle price")
print(result.primed.hints_loaded, result.recorded.hints_total)
```

## Common issues

**"no knowledge found" on every run** — store is writing to the wrong path. The default is `./.mycelium` relative to cwd. Either set `MYCELIUM_STORE_PATH=./js/.mycelium` or run from inside `js/`.

**LLM extraction returns empty array** — the provider raw response may be too short or malformed. Set `MYCELIUM_DEBUG=1` to see the LLM response.

**TinyFish SSE stream hangs / auth error** — `TINYFISH_API_KEY` not set or `.env` not copied. The loader checks both `js/.env` and repo-root `.env`.

**"Cannot find module" errors** — deps not installed. From the root, `npm run install:js`.

**TypeScript errors** — run `npm run typecheck`. All files must pass before committing.

**dotenv not loading** — entry points must import `../load-env.ts` (not `dotenv/config` directly), so both env locations are tried.
