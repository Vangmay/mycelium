// Mycelium + Playwright
//
// The Playwright adapter is a runtime wrapper, not an autonomous agent.
// Replace the handler body with your own browser automation or LLM browser
// agent loop. Mycelium will still prime the goal before the run and record
// what happened afterwards.
//
// npm install mycelium playwright
// npx tsx examples/playwright-sdk.ts

import "dotenv/config"
import { playwrightAdapter, run } from "../index.ts"

async function main() {
  const result = await run({
    url: "example.com",
    goal: "summarize the page",
    adapter: playwrightAdapter({
      handler: async ({ page, input }) => {
        const steps: string[] = []

        await page.goto(input.url.startsWith("http") ? input.url : `https://${input.url}`)
        steps.push("opened page")

        const title = await page.title()
        const bodyText = await page.locator("body").innerText()
        steps.push("read page title and body text")

        return {
          success: true,
          steps,
          data: {
            title,
            note: "Replace this handler with your own LLM browser agent.",
            goalWithMyceliumMemory: input.goal,
            visibleTextPreview: bodyText.slice(0, 1200),
          },
          raw: bodyText,
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
