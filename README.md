# Mycelium 🌱

Self-improving memory layer for web agents.

Mycelium gives developers compounding web-agent memory on their own specific workflows, backed by a local graph store they own and can inspect.

## How it works

Most web-agent calls start cold. Mycelium fixes this with two phases:

- **`prime(domain, goal)`** — loads past learnings and injects them into the goal prompt before each run
- **`record(outcome)`** — parses what happened and writes structured hints back to the local graph store

Expertise compounds across sessions. The agent gets smarter every run, on your specific domains.

## Repository layout

```
.
├── js/          JavaScript / TypeScript SDK and optional `myc` tools
├── python/      Python SDK (published as `mycelium-sdk` on PyPI)
├── server/      Web UI that runs on top of the JS SDK
└── package.json Root scripts that delegate to js/ for convenience
```

The JS SDK uses an embedded SQLite graph store. The older Python SDK still uses the previous JSON-store format.

## Quick start

```bash
git clone https://github.com/you/mycelium
cd mycelium
cp .env.example .env               # fill in provider keys as needed
npm run install:js                 # installs JS deps

# Demo — no API credits needed
npm run demo:mock

# Optional local tools
npm run tools -- run amazon.com "find the price of Kindle Paperwhite"
npm run tools -- inspect amazon.com
```

For the JS SDK API, local tools, and publish instructions see [js/README.md](js/README.md).
For Python, see [python/README.md](python/README.md).

## Root-level scripts

All forward to `js/`:

| Command | What it runs |
|---------|--------------|
| `npm run install:js` | `npm install` inside `js/` |
| `npm run demo` | `tsx demo/run-demo.ts` (real API calls) |
| `npm run demo:mock` | `MYCELIUM_MOCK=1 tsx demo/run-demo.ts` |
| `npm run tools -- <args>` | `tsx tools/index.ts <args>` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Build publishable `dist/` in `js/` |
| `npm run server` | Start the web UI (`server/server.ts`) |

## Configuration

One `.env` at the repo root is loaded by both SDKs:

```bash
TINYFISH_API_KEY=   # required only when using the TinyFish adapter
OPENAI_API_KEY=     # optional; used when LLM extraction or OpenAI embeddings are enabled
MYCELIUM_MOCK=1     # skip both APIs and use deterministic mocks
MYCELIUM_STORE_PATH=./js/.mycelium   # override the default store location
```

## Team sharing

Share the configured `MYCELIUM_STORE_PATH` if you want teams to reuse learned graph knowledge. What one developer's agent learns on Monday, the whole team can benefit from on Tuesday.

## Built for TinyFish SG Hackathon 2026
