export type HintType =
  | "blocker"     // cookie banners, popups, walls that must be dismissed first
  | "selector"    // stable CSS selectors or element identifiers
  | "timing"      // elements that lazy-load or need waits
  | "flow"        // multi-step navigation patterns
  | "failure"     // patterns that caused failures — avoid these
  | "auth"        // login/session flows (steps only, never credentials)
  | "rate_limit"  // throttling patterns and delays that help

export interface Hint {
  id: string
  type: HintType
  note: string
  action: string
  confidence: number  // 0.0 – 1.0
  seen: number        // how many runs confirmed this
  last: string        // ISO date string, YYYY-MM-DD
}

export interface RunHistoryEntry {
  ts: string          // ISO datetime
  goal: string
  success: boolean
  hintsUsed: number
  hintsAdded: number
  durationMs?: number
}

export interface DomainStore {
  domain: string
  updated: string     // ISO datetime
  runs: number
  successRate: number
  hints: Hint[]
  history: RunHistoryEntry[]
}

export interface RunOutcome {
  domain: string
  goal: string
  success: boolean
  steps: string[]
  errors: string[]
  raw: string         // full TinyFish response text
  durationMs?: number
}
