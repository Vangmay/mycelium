// Mycelium — advanced SDK usage with manual prime/record
// npx tsx examples/advanced-sdk.ts

import 'dotenv/config'
import { prime, record, buildGoal } from "../index.ts"

async function myPipeline(domain: string, goal: string) {
  const primed = await prime(domain)
  console.log(`loaded ${primed.hintsLoaded} hints for ${domain}`)

  const enrichedGoal = buildGoal(goal, primed)

  // Replace with your own TinyFish integration
  const tinyfishResult = await callMyAgent(domain, enrichedGoal)

  const recorded = await record({
    domain,
    goal,
    success: tinyfishResult.ok,
    steps: tinyfishResult.steps,
    errors: tinyfishResult.errors,
    raw: tinyfishResult.rawText,
  })

  console.log(`saved ${recorded.hintsExtracted} new hints (${recorded.hintsTotal} total)`)
  return tinyfishResult
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
