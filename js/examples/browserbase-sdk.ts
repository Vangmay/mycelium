// Mycelium + Browserbase
//
// Browserbase provides the cloud browser. Your handler or browser agent still
// decides what actions to take. Mycelium wraps that run with remembered context
// before execution and learning afterwards.
//
// npm install mycelium @browserbasehq/sdk playwright-core
// BROWSERBASE_API_KEY=... npx tsx examples/browserbase-sdk.ts

import "dotenv/config"
import { browserbaseAdapter, run } from "../index.ts"

async function main() {
  const result = await run({
    url: "example.com",
    goal: "summarize the page in a cloud browser",
    adapter: browserbaseAdapter({
      sessionOptions: {
        projectId: process.env.BROWSERBASE_PROJECT_ID,
      },
      handler: async ({ page, session, input }) => {
        const steps: string[] = []

        await page.goto(input.url.startsWith("http") ? input.url : `https://${input.url}`)
        steps.push("opened cloud browser page")

        const title = await page.title()
        const bodyText = await page.locator("body").innerText()
        steps.push("read page title and body text")

        return {
          success: true,
          steps,
          data: {
            title,
            sessionId: session.id,
            note: "Plug Stagehand, LangGraph, or your own LLM browser agent into this handler.",
            goalWithMyceliumMemory: input.goal,
            visibleTextPreview: bodyText.slice(0, 1200),
          },
          raw: JSON.stringify({ session, bodyText }),
        }
      },
    }),
  })

  console.log("success:", result.success)
  console.log("data:", result.data)
  console.log("hints loaded:", result.primed.hintsLoaded)
  console.log("hints saved:", result.recorded.hintsExtracted)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
