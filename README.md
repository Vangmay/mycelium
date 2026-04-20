# Mycelium 🌱

Self-improving memory layer for TinyFish web agents.

TinyFish learns at the platform level. Mycelium gives every developer that same compounding advantage on their own specific workflows — stored in a file they own and can inspect.

## How it works

Every TinyFish API call starts cold. Mycelium fixes this with two functions:

- **`prime(domain)`** — loads past learnings and injects them into the goal prompt before each run
- **`record(domain, outcome)`** — parses what happened and writes structured hints back to `.mycelium/<domain>.json`

Expertise compounds across sessions. The agent gets smarter every run, on your specific domains.

## Repository layout

```
.
├── js/          JavaScript / TypeScript SDK and `myc` CLI (published as `mycelium` on npm)
├── python/      Python SDK (published as `mycelium-sdk` on PyPI)
├── server/      Web UI that runs on top of the JS SDK
└── package.json Root scripts that delegate to js/ for convenience
```

The two SDKs share one on-disk format (`.mycelium/<domain>.json`) so Node and Python agents can read/write the same store.

## Quick start

```bash
git clone https://github.com/you/mycelium
cd mycelium
cp .env.example .env               # fill in TINYFISH_API_KEY + OPENAI_API_KEY
npm run install:js                 # installs JS deps

# Demo — no API credits needed
npm run demo:mock

# Real run via the CLI
npm run cli -- run amazon.com "find the price of Kindle Paperwhite"
npm run cli -- inspect amazon.com
```

For the JS SDK API, CLI commands, and publish instructions see [js/README.md](js/README.md).
For Python, see [python/README.md](python/README.md).

## Root-level scripts

All forward to `js/`:

| Command | What it runs |
|---------|--------------|
| `npm run install:js` | `npm install` inside `js/` |
| `npm run demo` | `tsx demo/run-demo.ts` (real API calls) |
| `npm run demo:mock` | `MYCELIUM_MOCK=1 tsx demo/run-demo.ts` |
| `npm run cli -- <args>` | `tsx cli/index.ts <args>` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Build publishable `dist/` in `js/` |
| `npm run server` | Start the web UI (`server/server.ts`) |

## Configuration

One `.env` at the repo root is loaded by both SDKs:

```bash
TINYFISH_API_KEY=   # required for real runs
OPENAI_API_KEY=     # required for hint extraction
MYCELIUM_MOCK=1     # skip both APIs and use deterministic mocks
MYCELIUM_STORE_PATH=./js/.mycelium   # override the default store location
```

## Team sharing

Commit `js/.mycelium/` (or whichever `MYCELIUM_STORE_PATH` you use). Git is the sync mechanism — no server needed. What one developer's agent learns on Monday, the whole team benefits from on Tuesday.

## Built for TinyFish SG Hackathon 2026
