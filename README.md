# Mycelium 🌱

Self-improving memory layer for TinyFish web agents.

TinyFish learns at the platform level. Mycelium gives every developer that same compounding advantage on their own specific workflows — stored in a file they own and can inspect.

## How it works

Every TinyFish API call starts cold. Mycelium fixes this with two functions:

- **`prime(domain)`** — loads past learnings and injects them into the goal prompt before each run
- **`record(domain, outcome)`** — parses what happened and writes structured hints back to `.mycelium/<domain>.json`

Expertise compounds across sessions. The agent gets smarter every run, on your specific domains.

## Quick start — CLI

```bash
# 1. clone and install
git clone https://github.com/you/mycelium
cd mycelium
npm install

# 2. configure keys
cp .env.example .env
# edit .env and fill in TINYFISH_API_KEY and OPENAI_API_KEY

# 3. run your first agent
npx tsx cli/index.ts run amazon.com "find the price of Kindle Paperwhite"

# 4. see what it learned
npx tsx cli/index.ts inspect amazon.com

# 5. run again — it loads the hints from step 3
npx tsx cli/index.ts run amazon.com "find the price of Kindle Paperwhite"
```

## Demo mode (no API credits needed)

```bash
# rehearse the full 5-session learning arc offline
npm run demo:mock

# run for real
npm run demo
```

## Quick start — SDK

```typescript
import 'dotenv/config'
import { run } from "mycelium"

// one import, one rename — result shape identical to TinyFish
const result = await run({
  url: "amazon.com",
  goal: "find the price of Kindle Paperwhite",
})

console.log(result.data)            // TinyFish response
console.log(result.primed.hintsLoaded)   // hints loaded this run
console.log(result.recorded.hintsTotal)  // total hints in store
```

## CLI commands

| Command | Description |
|---------|-------------|
| `npx tsx cli/index.ts run <url> <goal>` | Run with priming and auto-recording |
| `npx tsx cli/index.ts inspect <domain>` | Coloured knowledge store view |
| `npx tsx cli/index.ts stats [--all]` | Success rate trend |
| `npx tsx cli/index.ts history <domain>` | Timestamped run timeline |
| `npx tsx cli/index.ts replay <domain>` | Re-run recent goals |
| `npx tsx cli/index.ts batch <file>` | Multi-domain batch from JSON |
| `npx tsx cli/index.ts clear <domain>` | Wipe domain store |

## Configuration

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

Optional `mycelium.config.ts` for store behaviour:

```typescript
export default {
  storePath:     "./.mycelium", // where domain JSON files live
  decayDays:     14,            // days before confidence halves
  minConfidence: 0.6,           // minimum score to inject a hint
  maxHints:      10,            // max hints injected per session
}
```

## Team sharing

Commit `.mycelium/` to your repository. Git is the sync mechanism — no server needed. What one developer's agent learns on Monday, the whole team benefits from on Tuesday.

## Built for TinyFish SG Hackathon 2026
