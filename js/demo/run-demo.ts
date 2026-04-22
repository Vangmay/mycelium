#!/usr/bin/env tsx
import "../load-env.ts"
// Mycelium hackathon demo — 5-session learning arc
// Usage: npx tsx demo/run-demo.ts

import { run } from "../core/runner.ts"
import { cmdInspect } from "../cli/inspect.ts"
import { cmdStats } from "../cli/stats.ts"
import { cmdClear } from "../cli/clear.ts"

const DEMO_DOMAIN = "amazon.com"
const DEMO_GOAL   = "Find the current price of Kindle Paperwhite 16GB"
const SESSIONS    = 5
const DELAY_MS    = 800  // pause between sessions for readability

// ── helpers ────────────────────────────────────────────────────────────────

function divider(label: string) {
  const pad = "─".repeat(Math.max(0, 54 - label.length))
  console.log(`\n  ── ${label} ${pad}`)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function successLabel(success: boolean, pct?: number): string {
  if (success) return pct !== undefined ? `✓  ${pct}%` : "✓  success"
  return pct !== undefined ? `✗  ${pct}%` : "✗  failed"
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n  Mycelium — hackathon demo")
  console.log(`  domain: ${DEMO_DOMAIN}`)
  console.log(`  goal:   ${DEMO_GOAL}`)
  // Clear any existing store so demo starts fresh
  cmdClear(DEMO_DOMAIN)

  const results: { session: number; success: boolean }[] = []

  for (let i = 1; i <= SESSIONS; i++) {
    divider(`Session ${i} of ${SESSIONS}`)

    const result = await run({
      url: DEMO_DOMAIN,
      goal: DEMO_GOAL,
    })

    results.push({ session: i, success: result.success })

    const successRate = Math.round(
      (results.filter((r) => r.success).length / results.length) * 100
    )

    console.log(`\n  session ${i}: ${successLabel(result.success, successRate)}`)
    console.log(`  hints loaded: ${result.primed.hintsLoaded}   hints saved: ${result.recorded.hintsTotal}`)

    if (i < SESSIONS) await sleep(DELAY_MS)
  }

  // ── summary ──────────────────────────────────────────────────────────────
  divider("Results")

  for (const r of results) {
    const bar = r.success ? "█████████████████████" : "██████░░░░░░░░░░░░░░░"
    console.log(`  run ${r.session}  ${bar}  ${r.success ? "success" : "failed"}`)
  }

  const total = results.filter((r) => r.success).length
  console.log(`\n  ${total}/${SESSIONS} runs succeeded\n`)

  // ── live inspect ─────────────────────────────────────────────────────────
  divider("Knowledge store after 5 sessions")
  cmdInspect(DEMO_DOMAIN)

  // ── stats ─────────────────────────────────────────────────────────────────
  divider("Stats")
  cmdStats(true)
}

main().catch((e) => {
  console.error(`\n  demo error: ${e.message}\n`)
  process.exit(1)
})
