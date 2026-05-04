import { primeFromGraph } from "../store/graph/traversal.ts"
import type { Hint } from "../store/types.ts"

export interface PrimeResult {
  domain: string
  hintsLoaded: number
  hintsUsedIds: string[]
  promptBlock: string
}

export async function prime(domain: string, goal?: string): Promise<PrimeResult> {
  const hints = await primeFromGraph({ domain, goal })

  if (hints.length === 0) {
    return { domain, hintsLoaded: 0, hintsUsedIds: [], promptBlock: "" }
  }

  const lines = hints.map(formatHint)
  const promptBlock = [
    `IMPORTANT — KNOWN HINTS FOR ${domain} (follow these, do not rediscover):`,
    ...lines,
    "",
  ].join("\n")

  return {
    domain,
    hintsLoaded: hints.length,
    hintsUsedIds: hints.map((h) => h.id),
    promptBlock,
  }
}

function formatHint(h: Hint): string {
  const conf = Math.round(h.confidence * 100)
  const source = h.source === "rule" ? "RULE" : h.source === "manual" ? "MANUAL" : null
  const labels = [
    h.type === "flow" ? "SHORTCUT" : null,
    source,
    `${conf}% confident`,
  ].filter(Boolean)
  const rendered = renderAgentSafeHint(h)
  return `- [${labels.join(", ")}] ${rendered.note} → ${rendered.action}`
}

function renderAgentSafeHint(h: Hint): { note: string; action: string } {
  if (h.tags?.includes("login_wall")) {
    return {
      note: "Public search results are often a better entry point",
      action: "Start from a public search result for the requested content before opening the target page",
    }
  }
  if (h.tags?.includes("anti_bot") || h.tags?.includes("captcha")) {
    return {
      note: "Public search results are often a better entry point",
      action: "Use public search results or other public entry points before opening the target page",
    }
  }
  if (h.tags?.includes("rate_limited")) {
    return {
      note: "Public cached or search result pages may be more reliable",
      action: "Space out requests and prefer public search results or cached public pages",
    }
  }
  if (h.tags?.includes("auth_required")) {
    return {
      note: "Public pages are preferable when no session is available",
      action: "Use public pages and search result snippets when no authenticated session is available",
    }
  }
  return { note: h.note, action: h.action }
}

const GUIDANCE_RULES = `RULES:
- Follow the hints above — do not rediscover what is already known
- If a hint redirects you to a different site or method, go there directly without attempting the original first
- If direct access is not reliable, use public search results, cached pages, or other public entry points`

export function buildGoal(originalGoal: string, primeResult: PrimeResult): string {
  if (!primeResult.promptBlock) return originalGoal
  return `${primeResult.promptBlock}\n${GUIDANCE_RULES}\n\nTASK: ${originalGoal}`
}
