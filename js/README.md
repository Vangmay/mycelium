# mycelium (JavaScript / TypeScript)

JS SDK for Mycelium, with optional local `myc` tools for inspection and debugging. Published as `mycelium` on npm.

## Install

```bash
npm install mycelium
```

## SDK — two-phase integration

```typescript
import 'dotenv/config'
import { prime, buildGoal, record } from "mycelium"

const url = "amazon.com"
const domain = "amazon.com"
const goal = "find the price of Kindle Paperwhite"

const primed = await prime(domain, goal)
const enrichedGoal = buildGoal(goal, primed)

// Call whichever web agent provider your app already uses.
const agentResult = await yourWebAgent.run({ url, goal: enrichedGoal })

await record({
  domain,
  goal,
  success: agentResult.success,
  steps: agentResult.steps,
  errors: agentResult.errors,
  raw: agentResult.raw,
  durationMs: agentResult.durationMs,
}, {
  hintsUsedIds: primed.hintsUsedIds,
})
```

## SDK — adapter convenience

```typescript
import { run, tinyfishAdapter } from "mycelium"

const result = await run({
  url: "amazon.com",
  goal: "find the price of Kindle Paperwhite",
  adapter: tinyfishAdapter({
    browserProfile: "stealth", // optional: "lite" is TinyFish's default
  }),
})

console.log(result.data)
console.log(result.primed.hintsLoaded)
console.log(result.recorded.hintsExtracted)
```

## Adapter model

Mycelium is a memory layer, not a replacement for every browser agent.

- `tinyfishAdapter()` wraps an autonomous web-agent provider. TinyFish interprets the goal and drives the browser.
- `playwrightAdapter()` wraps a local Playwright browser runtime. You provide the handler or LLM browser agent that decides what to do.
- `browserbaseAdapter()` wraps a Browserbase cloud browser session. You provide the handler or LLM browser agent that decides what to do.

That means a Playwright or Browserbase integration usually looks like this:

```typescript
import { run, playwrightAdapter } from "mycelium"

const result = await run({
  url: "example.com",
  goal: "summarize the page",
  adapter: playwrightAdapter({
    handler: async ({ page, input }) => {
      // input.goal already includes Mycelium's past observations when any exist.
      // Replace this with your OpenAI, Anthropic, Stagehand, LangGraph, or
      // in-house browser agent loop.
      await page.goto(input.url)
      const title = await page.title()
      const text = await page.locator("body").innerText()

      return {
        success: true,
        steps: ["opened page", "read visible text"],
        data: { title, text: text.slice(0, 1000) },
        raw: text,
      }
    },
  }),
})

console.log(result.data)
```

The upside is provider independence: whatever browser agent you run, using whatever LLM, can still learn from past sessions through Mycelium.

See:

- [examples/playwright-sdk.ts](examples/playwright-sdk.ts)
- [examples/browserbase-sdk.ts](examples/browserbase-sdk.ts)
- [examples/custom-agent-handler.ts](examples/custom-agent-handler.ts)

## Local tools

```bash
npx myc inspect <domain>       # coloured knowledge store view
npx myc stats [--all]          # success rate trend
npx myc clear <domain>         # wipe domain store
npx myc run x.com "summarize a public post" --stealth
```

The `myc` binary is a developer/admin wrapper around the SDK. Application integrations should call the exported SDK functions directly.

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
TINYFISH_API_KEY=   # required only when using tinyfishAdapter()
OPENAI_API_KEY=     # optional; used when LLM extraction or OpenAI embeddings are enabled
MYCELIUM_LLM_EXTRACT=1  # optional; opt in to LLM hint extraction
MYCELIUM_MOCK=1     # skip both APIs entirely
MYCELIUM_STORE_PATH=./.mycelium   # override default store location
```

## Project layout

```
js/
├── index.ts              SDK public exports
├── mycelium.config.ts    Defaults (store path, decay, thresholds)
├── load-env.ts           Multi-path dotenv loader
├── adapters/
│   ├── types.ts          provider adapter contract
│   └── tinyfish.ts       TinyFish adapter
├── core/
│   ├── runner.ts         run() — prime → adapter → record
│   ├── prime.ts          prime(), buildGoal()
│   ├── recorder.ts       record() — rule hints + optional GPT-4o-mini extraction
│   └── mock.ts           offline mock responses
├── analyzer/
│   └── classifier.ts     deterministic web-automation symptoms → hints
├── store/
│   ├── types.ts          Hint, RunOutcome
│   └── graph/            SQLite graph, traversal, embeddings, queries
├── tools/                optional `myc` inspection/debugging wrappers
├── demo/                 5-session demo arc
└── examples/             basic-sdk.ts, advanced-sdk.ts, ...
```

## Publishing

```bash
npm run build              # writes dist/ with .js, .d.ts, sourcemaps
npm pack --dry-run         # preview tarball contents
npm publish                # ship it
```
