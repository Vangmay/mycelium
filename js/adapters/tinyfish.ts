import type { WebAgentAdapter, WebAgentRunInput, WebAgentRunResult } from "./types.ts"

export interface TinyFishAdapterOptions {
  apiKey?: string
  endpoint?: string
  browserProfile?: "lite" | "stealth"
  proxyConfig?: {
    enabled: boolean
    country_code?: string
  }
}

const DEFAULT_ENDPOINT = "https://agent.tinyfish.ai/v1/automation/run-sse"

export function tinyfishAdapter(options: TinyFishAdapterOptions = {}): WebAgentAdapter {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT

  return {
    name: "tinyfish",
    async run(input: WebAgentRunInput): Promise<WebAgentRunResult> {
      const apiKey = options.apiKey ?? process.env.TINYFISH_API_KEY
      if (!apiKey) throw new Error("TINYFISH_API_KEY is not set")

      const body: Record<string, unknown> = {
        url: input.url.startsWith("http") ? input.url : `https://${input.url}`,
        goal: input.goal,
      }
      if (options.browserProfile) body.browser_profile = options.browserProfile
      if (options.proxyConfig) body.proxy_config = options.proxyConfig

      const response = await fetch(endpoint, {
        method: "POST",
        signal: input.signal,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const body = await response.text().catch(() => "")
        throw new Error(`TinyFish API error: ${response.status} ${response.statusText}\n${body}`)
      }

      const steps: string[] = []
      const errors: string[] = []
      let raw = ""
      let data: unknown = null
      let success = false

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        raw += chunk

        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue
          if (process.env.MYCELIUM_DEBUG) console.log("[SSE RAW]", line.slice(6))
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === "PROGRESS" && event.purpose) {
              steps.push(event.purpose)
              input.onStep?.(event.purpose)
            }
            if (event.type === "FAILED" && event.message) {
              errors.push(event.message)
            }
            if (event.type === "COMPLETE") {
              success = event.status === "COMPLETED"
              data = event.result ?? event.data ?? (success ? null : event)
              if (!success) {
                const message = [
                  event.error,
                  event.message,
                  event.help_message,
                  event.help_url,
                ].filter(Boolean).join(" - ")
                if (message) errors.push(message)
              }
            }
          } catch {
            // Non-JSON SSE line; ignore.
          }
        }
      }

      return { success, data, raw, steps, errors }
    },
  }
}
