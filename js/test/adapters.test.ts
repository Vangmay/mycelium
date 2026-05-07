import assert from "node:assert/strict"
import test from "node:test"
import { browserbaseAdapter } from "../adapters/browserbase.ts"
import { playwrightAdapter } from "../adapters/playwright.ts"
import { normalizeAdapterHandlerResult } from "../adapters/types.ts"

const input = {
  url: "example.com",
  goal: "TASK:\nsummarize the page",
}

test("normalizes plain handler data", () => {
  const result = normalizeAdapterHandlerResult({ title: "Example Domain" })

  assert.equal(result.success, true)
  assert.deepEqual(result.data, { title: "Example Domain" })
  assert.deepEqual(result.steps, [])
  assert.deepEqual(result.errors, [])
})

test("normalizes explicit handler results", () => {
  const result = normalizeAdapterHandlerResult({
    success: false,
    data: { reason: "blocked" },
    raw: "blocked",
    steps: ["opened page"],
    errors: ["access denied"],
  })

  assert.equal(result.success, false)
  assert.deepEqual(result.data, { reason: "blocked" })
  assert.equal(result.raw, "blocked")
  assert.deepEqual(result.steps, ["opened page"])
  assert.deepEqual(result.errors, ["access denied"])
})

test("playwright adapter normalizes handler success", async () => {
  let closedPage = false
  let closedBrowser = false

  const adapter = playwrightAdapter({
    loadPlaywright: async () => ({
      chromium: {
        launch: async () => ({
          newPage: async () => ({
            close: async () => {
              closedPage = true
            },
          }),
          close: async () => {
            closedBrowser = true
          },
        }),
      },
    }),
    handler: async ({ input }) => ({
      success: true,
      data: { goal: input.goal },
      steps: ["handled"],
      raw: "ok",
    }),
  })

  const result = await adapter.run(input)

  assert.equal(result.success, true)
  assert.deepEqual(result.data, { goal: input.goal })
  assert.deepEqual(result.steps, ["handled"])
  assert.equal(closedPage, true)
  assert.equal(closedBrowser, true)
})

test("playwright adapter converts handler throws into failed runs", async () => {
  const adapter = playwrightAdapter({
    loadPlaywright: async () => ({
      chromium: {
        launch: async () => ({
          newPage: async () => ({ close: async () => undefined }),
          close: async () => undefined,
        }),
      },
    }),
    handler: async () => {
      throw new Error("agent loop failed")
    },
  })

  const result = await adapter.run(input)

  assert.equal(result.success, false)
  assert.deepEqual(result.errors, ["agent loop failed"])
})

test("playwright adapter reports missing optional dependency", async () => {
  const adapter = playwrightAdapter({
    loadPlaywright: async () => {
      const error: NodeJS.ErrnoException = new Error("missing")
      error.code = "ERR_MODULE_NOT_FOUND"
      throw error
    },
    handler: async () => ({ success: true }),
  })

  await assert.rejects(
    () => adapter.run(input),
    /Install playwright to use playwrightAdapter/,
  )
})

test("browserbase adapter normalizes handler success", async () => {
  let connectedTo = ""
  let closedBrowser = false

  const adapter = browserbaseAdapter({
    apiKey: "test-key",
    loadBrowserbase: async () => ({
      default: class Browserbase {
        sessions = {
          create: async () => ({ id: "session_123", connectUrl: "wss://browserbase.test" }),
        }
      },
    }),
    loadPlaywrightCore: async () => ({
      chromium: {
        connectOverCDP: async (url: string) => {
          connectedTo = url
          return {
            contexts: () => [{
              pages: () => [{}],
              newPage: async () => ({}),
            }],
            close: async () => {
              closedBrowser = true
            },
          }
        },
      },
    }),
    handler: async ({ session }) => ({
      success: true,
      data: { sessionId: session.id },
      steps: ["handled cloud browser"],
      raw: "ok",
    }),
  })

  const result = await adapter.run(input)

  assert.equal(result.success, true)
  assert.deepEqual(result.data, { sessionId: "session_123" })
  assert.deepEqual(result.steps, ["handled cloud browser"])
  assert.equal(connectedTo, "wss://browserbase.test")
  assert.equal(closedBrowser, true)
})

test("browserbase adapter reports missing optional dependency", async () => {
  const adapter = browserbaseAdapter({
    apiKey: "test-key",
    loadBrowserbase: async () => {
      const error: NodeJS.ErrnoException = new Error("missing")
      error.code = "ERR_MODULE_NOT_FOUND"
      throw error
    },
    loadPlaywrightCore: async () => ({}),
    handler: async () => ({ success: true }),
  })

  await assert.rejects(
    () => adapter.run(input),
    /Install @browserbasehq\/sdk to use browserbaseAdapter/,
  )
})

test("playwright smoke test runs when playwright is installed", async (t) => {
  let playwright: any
  try {
    playwright = await new Function("return import('playwright')")()
  } catch {
    t.skip("playwright is not installed")
    return
  }

  const adapter = playwrightAdapter({
    loadPlaywright: async () => playwright,
    handler: async ({ page, input }) => {
      await page.goto(input.url.startsWith("http") ? input.url : `https://${input.url}`)
      return {
        success: true,
        data: { title: await page.title() },
        steps: ["opened page"],
      }
    },
  })

  const result = await adapter.run(input)
  assert.equal(result.success, true)
  assert.equal((result.data as any).title, "Example Domain")
})

test("browserbase smoke test is skipped without credentials", async (t) => {
  if (!process.env.BROWSERBASE_API_KEY) {
    t.skip("BROWSERBASE_API_KEY is not set")
    return
  }

  let browserbase: any
  let playwrightCore: any
  try {
    browserbase = await new Function("return import('@browserbasehq/sdk')")()
    playwrightCore = await new Function("return import('playwright-core')")()
  } catch {
    t.skip("Browserbase peer packages are not installed")
    return
  }

  const adapter = browserbaseAdapter({
    loadBrowserbase: async () => browserbase,
    loadPlaywrightCore: async () => playwrightCore,
    handler: async ({ page, session, input }) => {
      await page.goto(input.url.startsWith("http") ? input.url : `https://${input.url}`)
      return {
        success: true,
        data: { title: await page.title(), sessionId: session.id },
        steps: ["opened cloud page"],
      }
    },
  })

  const result = await adapter.run(input)
  assert.equal(result.success, true)
  assert.equal((result.data as any).title, "Example Domain")
})
