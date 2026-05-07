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

export interface PlaywrightHandlerContext {
  input: WebAgentRunInput
  page: any
  browser: any
  playwright: any
}

export interface PlaywrightAdapterOptions {
  handler: AdapterHandler<PlaywrightHandlerContext>
  launchOptions?: Record<string, unknown>
  loadPlaywright?: () => Promise<any>
}

export function playwrightAdapter(options: PlaywrightAdapterOptions): WebAgentAdapter {
  if (!options.handler) {
    throw new Error("playwrightAdapter requires a handler")
  }

  return {
    name: "playwright",
    async run(input: WebAgentRunInput): Promise<WebAgentRunResult> {
      const playwright = await loadOptional(
        "playwright",
        options.loadPlaywright,
        "Install playwright to use playwrightAdapter: npm install playwright",
      )

      const browser = await playwright.chromium.launch(options.launchOptions ?? {})
      try {
        const page = await browser.newPage()
        try {
          const result = await options.handler({ input, page, browser, playwright })
          return normalizeAdapterHandlerResult(result)
        } catch (error) {
          return errorToRunResult(error)
        } finally {
          await page.close().catch(() => undefined)
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
