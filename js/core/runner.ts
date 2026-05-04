import { prime, buildGoal } from "./prime.ts"
import { record } from "./recorder.ts"
import { tinyfishAdapter } from "../adapters/tinyfish.ts"
import type { WebAgentAdapter } from "../adapters/types.ts"
import type { RunOutcome } from "../store/types.ts"
import type { PrimeResult } from "./prime.ts"
import type { RecordResult } from "./recorder.ts"

export interface RunOptions {
  url: string
  goal: string
  adapter?: WebAgentAdapter
  silent?: boolean  // suppress console output when used as SDK
}

export interface RunResult {
  success: boolean
  data: any
  primed: PrimeResult
  recorded: RecordResult
  raw: string
}

export async function run(options: RunOptions): Promise<RunResult> {
  const { url, goal, adapter = tinyfishAdapter(), silent = false } = options
  const domain = extractDomain(url)

  // Step 1: prime
  const primed = await prime(domain, goal)
  if (!silent && primed.hintsLoaded > 0) {
    console.log(`  + ${primed.hintsLoaded} hint${primed.hintsLoaded > 1 ? "s" : ""} loaded for ${domain}`)
  } else if (!silent) {
    console.log(`  no knowledge found for ${domain} — starting fresh`)
  }

  // Step 2: call the configured web agent provider.
  const enrichedGoal = buildGoal(goal, primed)
  const t0 = Date.now()
  const { success, data, raw, steps, errors } = await adapter.run({
    url,
    goal: enrichedGoal,
    onStep: silent ? undefined : (step) => process.stdout.write(`  · ${step}\n`),
  })
  const durationMs = Date.now() - t0

  // Step 3: record
  const outcome: RunOutcome = { domain, goal, success, steps, errors, raw, durationMs }
  const recorded = await record(outcome, { hintsUsedIds: primed.hintsUsedIds })
  if (!silent) {
    if (recorded.hintsExtracted > 0) {
      console.log(`  + ${recorded.hintsExtracted} new hint${recorded.hintsExtracted > 1 ? "s" : ""} saved (${recorded.hintsTotal} total)`)
    } else {
      console.log(`  no new hints extracted`)
    }
  }

  return { success, data, primed, recorded, raw }
}

function extractDomain(url: string): string {
  try {
    const u = url.startsWith("http") ? new URL(url) : new URL(`https://${url}`)
    return u.hostname.replace(/^www\./, "")
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0]
  }
}
