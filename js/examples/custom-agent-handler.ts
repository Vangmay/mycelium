// Mycelium + a custom LLM browser agent
//
// This is the intended pattern for Playwright and Browserbase runtime adapters:
// Mycelium adds memory to the goal, your agent acts, and Mycelium records the
// outcome so the next session can improve.
//
// npx tsx examples/custom-agent-handler.ts

import "dotenv/config"
import { playwrightAdapter, run } from "../index.ts"

const myLLMBrowserAgent = {
  async run({ page, goal }: { page: any; goal: string }) {
    const steps: string[] = []

    // Replace this with your OpenAI, Anthropic, Stagehand, LangGraph, or
    // in-house agent loop. The important bit is that goal already contains
    // Mycelium's past observations when any exist.
    await page.goto("https://example.com")
    steps.push("opened page")

    const title = await page.title()
    const text = await page.locator("body").innerText()
    steps.push("read visible text")

    return {
      ok: true,
      steps,
      answer: {
        title,
        goalSeenByAgent: goal,
        summaryInput: text.slice(0, 800),
      },
      rawText: text,
      errors: [],
    }
  },
}

async function main() {
  const result = await run({
    url: "example.com",
    goal: "summarize the page",
    adapter: playwrightAdapter({
      handler: async ({ page, input }) => {
        const agentResult = await myLLMBrowserAgent.run({
          page,
          goal: input.goal,
        })

        return {
          success: agentResult.ok,
          data: agentResult.answer,
          steps: agentResult.steps,
          errors: agentResult.errors,
          raw: agentResult.rawText,
        }
      },
    }),
  })

  console.log("success:", result.success)
  console.log("agent data:", result.data)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
