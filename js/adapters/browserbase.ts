import type {
  AdapterHandler,
  WebAgentAdapter,
  WebAgentRunInput,
  WebAgentRunResult,
} from "./types.ts"
import {
  errorToRunResult,
  normalizeAdapterHandlerResult,
} from "./types.ts"

export interface BrowserbaseHandlerContext {
  input: WebAgentRunInput
  page: any
  browser: any
  session: any
  browserbase: any
  playwright: any
}

export interface BrowserbaseAdapterOptions {
  apiKey?: string
  sessionOptions?: Record<string, unknown>
  handler: AdapterHandler<BrowserbaseHandlerContext>
  loadBrowserbase?: () => Promise<any>
  loadPlaywrightCore?: () => Promise<any>
}

export function browserbaseAdapter(options: BrowserbaseAdapterOptions): WebAgentAdapter {
  if (!options.handler) {
    throw new Error("browserbaseAdapter requires a handler")
  }

  return {
    name: "browserbase",
    async run(input: WebAgentRunInput): Promise<WebAgentRunResult> {
      const apiKey = options.apiKey ?? process.env.BROWSERBASE_API_KEY
      if (!apiKey) throw new Error("BROWSERBASE_API_KEY is not set")

      const browserbase = await loadOptional(
        "@browserbasehq/sdk",
        options.loadBrowserbase,
        "Install @browserbasehq/sdk to use browserbaseAdapter: npm install @browserbasehq/sdk",
      )
      const playwright = await loadOptional(
        "playwright-core",
        options.loadPlaywrightCore,
        "Install playwright-core to use browserbaseAdapter: npm install playwright-core",
      )

      const Browserbase = browserbase.Browserbase ?? browserbase.default
      if (!Browserbase) {
        throw new Error("@browserbasehq/sdk did not expose a Browserbase client")
      }

      const bb = new Browserbase({ apiKey })
      const session = await bb.sessions.create(options.sessionOptions ?? {})
      const browser = await playwright.chromium.connectOverCDP(session.connectUrl)

      try {
        const context = browser.contexts()[0]
        const page = context.pages()[0] ?? await context.newPage()
        try {
          const result = await options.handler({
            input,
            page,
            browser,
            session,
            browserbase: bb,
            playwright,
          })
          return normalizeAdapterHandlerResult(result)
        } catch (error) {
          return errorToRunResult(error)
        }
      } finally {
        await browser.close().catch(() => undefined)
      }
    },
  }
}

async function loadOptional(
  packageName: string,
  loader: (() => Promise<any>) | undefined,
  message: string,
) {
  try {
    return loader ? await loader() : await dynamicImport(packageName)
  } catch (error: any) {
    if (error?.code === "ERR_MODULE_NOT_FOUND" || error?.code === "MODULE_NOT_FOUND") {
      throw new Error(message)
    }
    throw error
  }
}

function dynamicImport(packageName: string): Promise<any> {
  return new Function("packageName", "return import(packageName)")(packageName)
}
