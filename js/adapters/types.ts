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

