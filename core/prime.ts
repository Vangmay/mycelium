import { readStore, applyDecay, filterHints } from "../store/reader.ts"
import type { Hint } from "../store/types.ts"

export interface PrimeResult {
  domain: string
  hintsLoaded: number
  promptBlock: string
}

export function prime(domain: string): PrimeResult {
  const raw = readStore(domain)
  const decayed = applyDecay(raw)
  const hints = filterHints(decayed)

  if (hints.length === 0) {
    return { domain, hintsLoaded: 0, promptBlock: "" }
  }

  const lines = hints.map((h) => formatHint(h))
  const promptBlock = [
    `KNOWN HINTS FOR ${domain}:`,
    ...lines,
    "",
  ].join("\n")

  return { domain, hintsLoaded: hints.length, promptBlock }
}

function formatHint(h: Hint): string {
  const conf = Math.round(h.confidence * 100)
  return `- [${conf}% confident] ${h.note}. ${h.action}`
}

export function buildGoal(originalGoal: string, primeResult: PrimeResult): string {
  if (!primeResult.promptBlock) return originalGoal
  return `${primeResult.promptBlock}\nTASK: ${originalGoal}`
}
