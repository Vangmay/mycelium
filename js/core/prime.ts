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
  const prefix = h.type === "flow" ? `- [SHORTCUT, ${conf}% confident]` : `- [${conf}% confident]`
  return `${prefix} ${h.note} → ${h.action}`
}

const STOP_RULES = `RULES:
- Follow the hints above — do not rediscover what is already known
- If a hint redirects you to a different site or method, go there directly without attempting the original first
- If you hit a login wall, cookie banner, or access block that has no hint: stop and return what you have, do not retry`

export function buildGoal(originalGoal: string, primeResult: PrimeResult): string {
  if (!primeResult.promptBlock) return originalGoal
  return `${primeResult.promptBlock}\n${STOP_RULES}\n\nTASK: ${originalGoal}`
}
