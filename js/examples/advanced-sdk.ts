// Mycelium — advanced SDK usage with two-phase prime/record
// npx tsx examples/advanced-sdk.ts

import 'dotenv/config'
import { prime, record, buildGoal } from "../index.ts"

async function myPipeline(domain: string, goal: string) {
  const primed = await prime(domain, goal)
  console.log(`loaded ${primed.hintsLoaded} hints for ${domain}`)

  const enrichedGoal = buildGoal(goal, primed)

  // Replace with your own Stagehand, Playwright, Browserbase, TinyFish,
  // browser-use, or in-house web agent integration.
  const agentResult = await callMyAgent(domain, enrichedGoal)

  const recorded = await record({
    domain,
    goal,
    success: agentResult.ok,
    steps: agentResult.steps,
    errors: agentResult.errors,
    raw: agentResult.rawText,
  }, {
    hintsUsedIds: primed.hintsUsedIds,
  })

  console.log(`saved ${recorded.hintsExtracted} new hints (${recorded.hintsTotal} total)`)
  return agentResult
}

async function callMyAgent(domain: string, goal: string) {
  return {
    ok: true,
    steps: ["navigated", "clicked", "extracted"],
    errors: [],
    rawText: `Successfully extracted data from ${domain}`,
    data: { result: "example" },
  }
}

myPipeline("amazon.com", "find the price of AirPods Pro")
