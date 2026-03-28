// Mock mode — simulates TinyFish SSE responses for local testing
// Set MYCELIUM_MOCK=1 to enable. Responses degrade intentionally on
// early runs and improve as hints accumulate, mirroring the real demo arc.

import type { DomainStore, Hint, HintType } from "../store/types.ts"
import { readStore } from "../store/reader.ts"

export const MOCK_ENABLED = process.env.MYCELIUM_MOCK === "1"

interface MockResponse {
  success: boolean
  data: any
  steps: string[]
  errors: string[]
  raw: string
}

// Simulated friction points per domain
const DOMAIN_FRICTION: Record<string, string[]> = {
  "amazon.com":    ["cookie_banner", "lazy_price"],
  "linkedin.com":  ["login_wall", "rate_limit"],
  "booking.com":   ["cookie_banner", "date_picker_quirk"],
  "airbnb.com":    ["cookie_banner", "auth", "rate_limit"],
  "glassdoor.com": ["login_wall", "rate_limit"],
}

export function getMockResponse(domain: string, goal: string): MockResponse {
  const store = readStore(domain)
  const hintsLoaded = store.hints.filter((h) => h.confidence >= 0.6).length
  const friction = DOMAIN_FRICTION[domain] ?? ["cookie_banner"]

  // Determine which friction points are covered by loaded hints
  const coveredFriction = friction.filter((f) => {
    return store.hints.some(
      (h) => h.note.toLowerCase().includes(f.split("_")[0]) && h.confidence >= 0.6
    )
  })

  const uncoveredFriction = friction.filter((f) => !coveredFriction.includes(f))
  const successRate = coveredFriction.length / friction.length

  // Build realistic step sequence
  const steps: string[] = []
  const errors: string[] = []

  steps.push(`navigating to ${domain}`)

  if (uncoveredFriction.includes("cookie_banner")) {
    errors.push("blocked by cookie consent banner — could not proceed")
    steps.push("encountered cookie banner")
    return {
      success: false,
      data: null,
      steps,
      errors,
      raw: buildRaw(domain, goal, steps, errors, false, null),
    }
  } else if (coveredFriction.includes("cookie_banner")) {
    steps.push("dismissed cookie banner using #sp-cc-accept (hint applied)")
  }

  if (uncoveredFriction.includes("login_wall")) {
    errors.push("login wall detected — authentication required")
    return {
      success: false,
      data: null,
      steps,
      errors,
      raw: buildRaw(domain, goal, steps, errors, false, null),
    }
  }

  steps.push(`searching for target element`)

  if (uncoveredFriction.includes("lazy_price")) {
    errors.push("price element (.a-price) not found — may require additional wait")
    steps.push("extraction timeout on lazy-loaded element")
    const partialData = { price: null, note: "extraction incomplete — lazy element not awaited" }
    return {
      success: false,
      data: partialData,
      steps,
      errors,
      raw: buildRaw(domain, goal, steps, errors, false, partialData),
    }
  } else if (coveredFriction.includes("lazy_price")) {
    steps.push("waited for lazy-loaded price element (hint applied)")
  }

  steps.push("extracted target data successfully")

  const mockData = buildMockData(domain, goal)
  return {
    success: true,
    data: mockData,
    steps,
    errors: [],
    raw: buildRaw(domain, goal, steps, [], true, mockData),
  }
}

function buildMockData(domain: string, goal: string): any {
  if (domain.includes("amazon") && goal.toLowerCase().includes("price")) {
    return { price: "$139.99", asin: "B09TMF6742", title: "Kindle Paperwhite (16 GB)" }
  }
  if (domain.includes("linkedin")) {
    return { results: [{ name: "Jane Smith", title: "Senior Engineer at Acme" }] }
  }
  return { result: "mock data extracted successfully", domain }
}

// Error string patterns → deterministic hint templates (no LLM needed)
const ERROR_HINT_MAP: Array<{
  match: string
  type: HintType
  note: string
  action: string
}> = [
  {
    match: "cookie consent banner",
    type: "blocker",
    note: "cookie consent banner blocks navigation",
    action: "dismiss cookie banner with #sp-cc-accept before any interaction",
  },
  {
    match: "login wall",
    type: "auth",
    note: "login wall blocks access without authentication",
    action: "detect and handle login wall before attempting data extraction",
  },
  {
    match: "rate_limit",
    type: "rate_limit",
    note: "rate limiting detected — requests throttled",
    action: "add 2–5s delay between requests to avoid rate limit blocks",
  },
  {
    match: "lazy",
    type: "timing",
    note: "price element lazy-loads after initial render",
    action: "wait for .a-price to appear in DOM before extracting price data",
  },
  {
    match: "not found",
    type: "timing",
    note: "target element not immediately present — may require wait",
    action: "wait up to 5s for target element before declaring extraction failure",
  },
]

export function getMockHints(steps: string[], errors: string[]): Omit<Hint, "id" | "seen" | "last">[] {
  const hints: Omit<Hint, "id" | "seen" | "last">[] = []
  const combined = [...errors, ...steps].map((s) => s.toLowerCase())

  for (const template of ERROR_HINT_MAP) {
    const matched = combined.some((s) => s.includes(template.match))
    if (matched) {
      hints.push({
        type: template.type,
        note: template.note,
        action: template.action,
        confidence: 0.65,
      })
    }
  }

  return hints
}

function buildRaw(
  domain: string,
  goal: string,
  steps: string[],
  errors: string[],
  success: boolean,
  data: any
): string {
  return JSON.stringify({ domain, goal, steps, errors, success, data }, null, 2)
}
