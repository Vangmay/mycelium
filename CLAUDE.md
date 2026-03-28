# Mycelium

Self-improving memory layer for TinyFish web agents. Wraps the TinyFish API with a persistent knowledge store — one JSON file per domain — that accumulates operational learnings across sessions. Agents start every session knowing what worked last time.

## What this project does

Every TinyFish API call starts stateless. Mycelium fixes this with three steps per run:

1. **prime(domain)** — reads `.mycelium/<domain>.json`, applies confidence decay, injects surviving hints into the agent's goal prompt as natural language
2. **callTinyFish(url, enrichedGoal)** — streams the TinyFish SSE response, collects steps and errors
3. **record(domain, outcome)** — sends a summary to GPT-4o-mini, extracts structured hints, merges them back into the domain file

The store is plain JSON. No database, no server, no model training.

## Runtime

**Node.js + tsx** — TypeScript is executed directly via `tsx`. No compilation step.

```bash
# run the CLI
npx tsx cli/index.ts run amazon.com "find Kindle price"

# run the demo
npm run demo:mock    # mock mode
npm run demo         # real API calls

# type check
npm run typecheck
```

## Environment

The project uses **dotenv**. Keys are loaded from `.env` at startup via `import 'dotenv/config'` at the top of each entry point (`cli/index.ts`, `demo/run-demo.ts`).

```bash
cp .env.example .env   # then fill in your keys
```

**Never load dotenv in library files** (`core/`, `store/`). Only entry points load it.

## Environment variables

Loaded from `.env` via `dotenv`. Copy `.env.example` to `.env` before running anything.

```bash
TINYFISH_API_KEY=   # required for real runs
OPENAI_API_KEY=     # required for learning extraction in recorder.ts
MYCELIUM_MOCK=1     # set to skip TinyFish + OpenAI calls entirely
```

If `.env` is missing, the process will run but real API calls will fail with auth errors.

## Commands

```bash
npx tsx cli/index.ts run <url> <goal>      # run with prime + record
npx tsx cli/index.ts inspect <domain>      # coloured knowledge store view
npx tsx cli/index.ts stats [--all]         # success rate trend
npx tsx cli/index.ts history <domain>      # timestamped run timeline
npx tsx cli/index.ts replay <domain>       # re-run recent goals against current store
npx tsx cli/index.ts batch <file>          # multi-domain run from JSON array
npx tsx cli/index.ts clear <domain>        # wipe domain store
```

npm shortcuts:
```bash
npm run demo:mock    # MYCELIUM_MOCK=1 demo arc (no API spend)
npm run demo         # real demo arc
npm run typecheck    # tsc --noEmit
```

## Project structure

```
core/
  runner.ts     # run() — orchestrates prime → TinyFish → record
  prime.ts      # prime(), buildGoal() — reads store, builds prompt prefix
  recorder.ts   # record() — GPT-4o-mini extraction, merges hints
  mock.ts       # getMockResponse() — simulates TinyFish for offline testing

store/
  types.ts      # Hint, DomainStore, RunHistoryEntry, RunOutcome interfaces
  reader.ts     # readStore(), applyDecay(), filterHints()
  writer.ts     # mergeHints(), updateRunStats(), writeStore()

cli/
  index.ts      # commander entry point — thin wrappers only
  run.ts        # myc run
  inspect.ts    # myc inspect
  stats.ts      # myc stats
  history.ts    # myc history
  replay.ts     # myc replay
  batch.ts      # myc batch
  clear.ts      # myc clear

index.ts        # SDK public exports: { run, prime, record }
mycelium.config.ts  # storePath, decayDays, minConfidence, maxHints
demo/run-demo.ts    # 5-session hackathon demo script
```

## Key types

```typescript
// store/types.ts
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

Trust is slow to earn, quick to lose. This is intentional — stale selectors should stop being injected without manual intervention.

## Mock mode

`MYCELIUM_MOCK=1` replaces the TinyFish HTTP call with `getMockResponse()` in `core/mock.ts`. The mock:
- Reads the real `.mycelium/` store to decide which friction points are covered
- Simulates degraded responses when hints are missing, clean runs when they exist
- Writes real hints to the store so the learning arc compounds genuinely
- Is used by `demo/run-demo.ts` for offline rehearsal

The demo arc is genuine even in mock mode — the store accumulates real JSON.

## SSE parsing

TinyFish streams responses as server-sent events. `callTinyFish()` in `core/runner.ts` parses them:

```typescript
// Expected event types from TinyFish SSE stream
event.type === "step"    // agent navigation step — event.description
event.type === "error"   // agent error — event.message
event.type === "result"  // final extracted data — event.data or event.result
```

**These field names may not match what TinyFish actually sends.** If a real run produces no data, add `console.log(chunk)` before the JSON.parse in `callTinyFish()` and check actual field names. This is the most likely integration issue.

## Store file location

`.mycelium/` in the directory where `myc` is run (controlled by `storePath` in `mycelium.config.ts`). One JSON file per domain. Human-readable, git-committable.

## Adding a new CLI command

1. Create `cli/<name>.ts` — export `async function cmd<Name>(args) {}`
2. Import and register in `cli/index.ts` using `program.command(...).action(cmd<Name>)`
3. Implement using existing `core/` and `store/` functions — no logic in the CLI file

## Adding a new hint type

1. Add the new type to the `HintType` union in `store/types.ts`
2. Add a description line to the `EXTRACT_SYSTEM` prompt in `core/recorder.ts`
3. Add a colour entry in `cli/inspect.ts` TYPE_COLOURS map
4. Add a friction entry in `core/mock.ts` MOCK_HINTS if you want mock support

## SDK usage

```typescript
import { run } from "mycelium"

// Drop-in replacement for direct TinyFish call
const result = await run({ url: "amazon.com", goal: "find Kindle price" })
// result.data      — TinyFish response (identical shape)
// result.primed    — { hintsLoaded, promptBlock }
// result.recorded  — { hintsExtracted, hintsTotal }

// Manual control
import { prime, record } from "mycelium"
const ctx = prime("amazon.com")
const result = await myCustomCall(goal, ctx.promptBlock)
await record({ domain: "amazon.com", goal, success: true, steps: [], errors: [], raw: result })
```

## Demo sequence

```bash
# Rehearse offline — no API spend
npm run demo:mock

# Run for real
npm run demo

# After 5 sessions, show the store
npx tsx cli/index.ts inspect amazon.com

# Re-run goals against accumulated knowledge — this is the demo closer
npx tsx cli/index.ts replay amazon.com
```

## Common issues

**"no knowledge found" on every run** — store is writing to the wrong path. Check `storePath` in `mycelium.config.ts` matches where you're running from.

**GPT extraction returns empty array** — the raw TinyFish response is too short or malformed. Add `console.log(raw.slice(0, 500))` in `recorder.ts` before the GPT call.

**Chalk colours not rendering** — terminal doesn't support ANSI. Set `FORCE_COLOR=1` or switch terminal.

**SSE stream hangs / auth error** — `TINYFISH_API_KEY` not set or `.env` not copied. Run `cp .env.example .env` and fill in keys.

**"Cannot find module" errors** — tsx not installed. Run `npm install` first.

**TypeScript errors** — run `npm run typecheck`. All files must pass before committing.

**`dotenv` not loading** — make sure `import 'dotenv/config'` is at the top of the entry point being run, before any other imports that read `process.env`.
