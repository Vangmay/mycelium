import { prime, buildGoal } from "./prime.ts"
import { record } from "./recorder.ts"
import type { RunOutcome } from "../store/types.ts"
import type { PrimeResult } from "./prime.ts"
import type { RecordResult } from "./recorder.ts"

export interface RunOptions {
  url: string
  goal: string
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
  const { url, goal, silent = false } = options
  const domain = extractDomain(url)

  // Step 1: prime
  const primed = await prime(domain, goal)
  if (!silent && primed.hintsLoaded > 0) {
    console.log(`  + ${primed.hintsLoaded} hint${primed.hintsLoaded > 1 ? "s" : ""} loaded for ${domain}`)
  } else if (!silent) {
    console.log(`  no knowledge found for ${domain} — starting fresh`)
  }

  // Step 2: call TinyFish
  const enrichedGoal = buildGoal(goal, primed)
  const t0 = Date.now()
  const { success, data, raw, steps, errors } = await callTinyFish(url, enrichedGoal, silent)
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

async function callTinyFish(
  url: string,
  goal: string,
  silent: boolean
): Promise<{ success: boolean; data: any; raw: string; steps: string[]; errors: string[] }> {
  const apiKey = process.env.TINYFISH_API_KEY
  if (!apiKey) throw new Error("TINYFISH_API_KEY is not set")

  const response = await fetch("https://agent.tinyfish.ai/v1/automation/run-sse", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({ url: url.startsWith("http") ? url : `https://${url}`, goal }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`TinyFish API error: ${response.status} ${response.statusText}\n${body}`)
  }

  const steps: string[] = []
  const errors: string[] = []
  let raw = ""
  let data: any = null
  let success = false

  // Parse SSE stream
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value)
    raw += chunk

    // Parse SSE events
    const lines = chunk.split("\n")
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      if (process.env.MYCELIUM_DEBUG) console.log("[SSE RAW]", line.slice(6))
      try {
        const event = JSON.parse(line.slice(6))
        if (event.type === "PROGRESS" && event.purpose) {
          steps.push(event.purpose)
          if (!silent) process.stdout.write(`  · ${event.purpose}\n`)
        }
        if (event.type === "FAILED" && event.message) {
          errors.push(event.message)
        }
        if (event.type === "COMPLETE") {
          data = event.result ?? event.data
          success = event.status === "COMPLETED"
        }
      } catch {
        // non-JSON SSE line, skip
      }
    }
  }

  return { success, data, raw, steps, errors }
}

function extractDomain(url: string): string {
  try {
    const u = url.startsWith("http") ? new URL(url) : new URL(`https://${url}`)
    return u.hostname.replace(/^www\./, "")
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0]
  }
}
