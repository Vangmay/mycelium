# Mycelium

Memory and learning layer for browser agents.

Mycelium lets browser agents learn from past sessions. It primes an agent with domain-specific observations before a run, records what happened afterwards, and stores reusable knowledge in a local SQLite graph.

## How it works

Most web-agent calls start cold. Mycelium fixes this with two phases:

- **`prime(domain, goal)`** — loads past learnings and injects them into the goal prompt before each run
- **`record(outcome)`** — parses what happened and writes structured hints back to the local graph store

Expertise compounds across sessions. The agent gets smarter every run, on your specific domains.

## Repository layout

```
.
├── js/          JavaScript / TypeScript SDK, adapters, explorer, benchmarks, and `myc` tools
└── package.json Root scripts that delegate to js/ for convenience
```

The SDK uses an embedded SQLite graph store. It is provider-independent: TinyFish can run as an autonomous web-agent adapter, while Playwright and Browserbase are runtime adapters for your own browser agent or handler.

## Quick start

```bash
git clone https://github.com/you/mycelium
cd mycelium
cp .env.example .env               # fill in provider keys as needed
npm run install:js                 # installs JS deps
npm run typecheck
npm run build

# Optional local tools
npm run tools -- run amazon.com "find the price of Kindle Paperwhite"
npm run tools -- inspect amazon.com
```

For the JS SDK API, local tools, and publish instructions see [js/README.md](js/README.md).

## Root-level scripts

All forward to `js/`:

| Command | What it runs |
|---------|--------------|
| `npm run install:js` | `npm install` inside `js/` |
| `npm run tools -- <args>` | `tsx tools/index.ts <args>` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Build publishable `dist/` in `js/` |

## Configuration

One `.env` at the repo root is loaded by local JS entry points:

```bash
TINYFISH_API_KEY=   # required only when using the TinyFish adapter
OPENAI_API_KEY=     # optional; used when LLM extraction or OpenAI embeddings are enabled
MYCELIUM_STORE_PATH=./js/.mycelium   # override the default store location
```

## Local artifacts

Local graph and benchmark outputs are intentionally ignored by git:

```text
js/.mycelium/   # default SQLite graph store when running from js/
js/.bench/      # benchmark result JSON and temporary benchmark stores
*.db-shm
*.db-wal
```

If you want team-shared knowledge, export or copy the configured `MYCELIUM_STORE_PATH` intentionally instead of committing local database files by default.
