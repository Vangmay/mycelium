# mycelium (JavaScript / TypeScript)

JS SDK and `myc` CLI for Mycelium. Published as `mycelium` on npm.

## Install

```bash
npm install mycelium
```

## SDK — drop-in replacement for TinyFish

```typescript
import 'dotenv/config'
import { run } from "mycelium"

const result = await run({
  url: "amazon.com",
  goal: "find the price of Kindle Paperwhite",
})

console.log(result.data)                      // TinyFish response
console.log(result.primed.hintsLoaded)        // hints injected this run
console.log(result.recorded.hintsExtracted)   // new hints saved
console.log(result.recorded.hintsTotal)       // total hints in store
```

## SDK — manual control

```typescript
import { prime, record, buildGoal } from "mycelium"

const ctx = prime("amazon.com", "find Kindle price")
const enrichedGoal = buildGoal("find Kindle price", ctx)

// ...your own TinyFish call...

await record({
  domain: "amazon.com",
  goal: "find Kindle price",
  success: true,
  steps: ["navigated", "clicked", "extracted"],
  errors: [],
  raw: rawResponseText,
})
```

## CLI

```bash
npx myc run <url> <goal>       # run with priming + auto-recording
npx myc inspect <domain>       # coloured knowledge store view
npx myc stats [--all]          # success rate trend
npx myc history <domain>       # run timeline
npx myc replay <domain>        # re-run recent goals
npx myc batch <file>           # multi-domain batch from JSON
npx myc clear <domain>         # wipe domain store
```

## Local development

From the repo root:

```bash
npm run install:js
npm run demo:mock              # 5-session learning arc, offline
npm run build                  # writes js/dist/ for publishing
```

From inside `js/` directly:

```bash
npm run demo:mock
npm run build
```

## Environment

Loaded by [load-env.ts](load-env.ts) from `js/.env` and `../ .env` (repo root) — so a single `.env` at the repo root works.

```bash
TINYFISH_API_KEY=   # required for real runs
OPENAI_API_KEY=     # required for hint extraction in recorder.ts
MYCELIUM_MOCK=1     # skip both APIs entirely
MYCELIUM_STORE_PATH=./.mycelium   # override default store location
```

## Project layout

```
js/
├── index.ts              SDK public exports
├── mycelium.config.ts    Defaults (store path, decay, thresholds)
├── load-env.ts           Multi-path dotenv loader
├── core/
│   ├── runner.ts         run() — prime → TinyFish → record
│   ├── prime.ts          prime(), buildGoal()
│   ├── recorder.ts       record() — GPT-4o-mini extraction
│   └── mock.ts           offline mock responses
├── store/
│   ├── types.ts          Hint, DomainStore, RunOutcome
│   ├── reader.ts         readStore, applyDecay, filterHints
│   └── writer.ts         mergeHints, updateRunStats, writeStore
├── cli/                  `myc` subcommands (thin wrappers)
├── demo/                 5-session demo arc
└── examples/             basic-sdk.ts, advanced-sdk.ts, ...
```

## Publishing

```bash
npm run build              # writes dist/ with .js, .d.ts, sourcemaps
npm pack --dry-run         # preview tarball contents
npm publish                # ship it
```
