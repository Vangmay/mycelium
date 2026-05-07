export interface WebAgentRunInput {
  url: string
  goal: string
  signal?: AbortSignal
  onStep?: (step: string) => void
}

export interface WebAgentRunResult {
  success: boolean
  data: unknown
  raw: string
  steps: string[]
  errors: string[]
}

export interface WebAgentAdapter {
  name: string
  run(input: WebAgentRunInput): Promise<WebAgentRunResult>
}

export interface AdapterHandlerResult {
  success?: boolean
  data?: unknown
  raw?: string
  steps?: string[]
  errors?: string[]
}

export type AdapterHandler<TContext> = (
  context: TContext,
) => AdapterHandlerResult | Promise<AdapterHandlerResult> | unknown | Promise<unknown>

export function normalizeAdapterHandlerResult(result: unknown): WebAgentRunResult {
  if (isHandlerResult(result)) {
    const errors = Array.isArray(result.errors) ? result.errors.map(String) : []
    return {
      success: result.success ?? errors.length === 0,
      data: result.data ?? null,
      raw: result.raw ?? stringifyRaw(result.data ?? result),
      steps: Array.isArray(result.steps) ? result.steps.map(String) : [],
      errors,
    }
  }

  return {
    success: true,
    data: result ?? null,
    raw: stringifyRaw(result),
    steps: [],
    errors: [],
  }
}

export function errorToRunResult(error: unknown): WebAgentRunResult {
  const message = error instanceof Error ? error.message : String(error)
  return {
    success: false,
    data: null,
    raw: message,
    steps: [],
    errors: [message],
  }
}

function isHandlerResult(value: unknown): value is AdapterHandlerResult {
  if (!value || typeof value !== "object") return false
  return "success" in value
    || "data" in value
    || "raw" in value
    || "steps" in value
    || "errors" in value
}

function stringifyRaw(value: unknown): string {
  if (value === undefined) return ""
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
