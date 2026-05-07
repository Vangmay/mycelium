# Mycelium

Memory and learning layer for browser agents. Mycelium primes a browser-agent run with domain knowledge, records the outcome, and stores reusable hints in a local SQLite graph. TinyFish is one autonomous adapter; Playwright and Browserbase are runtime adapters for user-provided browser-agent logic.

## Repository Layout

```text
.
├── js/          JavaScript / TypeScript SDK, adapters, benchmarks, explorer, and tools
├── package.json Root scripts that delegate to js/
└── .env         Optional shared env file for local entry points
```

## Runtime

TypeScript runs through `tsx` during development. `npm run build` emits publishable files under `js/dist/`.

```bash
npm run install:js
npm run typecheck
npm test
npm run build
npm run tools -- inspect example.com
```

## Environment

`js/load-env.ts` tries `js/.env` and then repo-root `.env`. Do not load dotenv in library files under `js/core/` or `js/store/`; only local entry points such as tools and explorer should load env.

```bash
TINYFISH_API_KEY=          # required only for tinyfishAdapter()
OPENAI_API_KEY=            # optional; LLM extraction and OpenAI embeddings
MYCELIUM_LLM_EXTRACT=1     # optional; opt in to LLM hint extraction
MYCELIUM_STORE_PATH=./js/.mycelium
```

## JS Structure

```text
js/
├── index.ts              # SDK public exports
├── adapters/             # TinyFish, Playwright, Browserbase, shared adapter contract
├── core/                 # run(), prime(), buildGoal(), record()
├── analyzer/             # deterministic web-automation symptoms -> hints
├── store/graph/          # SQLite graph, traversal, embeddings, queries
├── tools/                # optional local inspection/debugging wrappers
├── explorer/             # local graph/prompt/benchmark explorer
├── bench/                # benchmark runner and task definitions
├── test/                 # Node test runner tests
└── examples/             # SDK and adapter examples
```

## Adapter Model

- `tinyfishAdapter()` wraps an autonomous web-agent provider.
- `playwrightAdapter()` wraps local Playwright browser runtime; users provide the handler or LLM browser agent.
- `browserbaseAdapter()` wraps a Browserbase cloud browser session; users provide the handler or LLM browser agent.

Do not make Playwright or Browserbase pretend to be autonomous agents. Their handlers receive the already-primed `input.goal`, execute browser logic, and return normalized run data for Mycelium to record.

## Local Artifacts

These are ignored by git:

```text
js/.mycelium/
js/.bench/
*.db-shm
*.db-wal
dist/
*.tgz
```

Keep reusable behavior in code, examples, and docs. Share graph knowledge intentionally by exporting or copying `MYCELIUM_STORE_PATH`, not by committing SQLite files by default.

## Common Commands

```bash
npm run tools -- run <url> <goal>    # TinyFish-backed debug run
npm run tools -- inspect <domain>    # inspect learned hints
npm run tools -- stats [--all]       # success trend
npm run tools -- history <domain>    # run timeline
npm run tools -- replay <domain>     # replay recent goals
npm run tools -- clear <domain>      # wipe one domain
```

## Before Committing

Run:

```bash
npm run typecheck
npm test
npm run build
```
