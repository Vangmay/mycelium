import { existsSync, readFileSync } from "fs"
import { join } from "path"
import type { DomainStore, Hint } from "./types.ts"
import config from "../mycelium.config.ts"

export function storePath(domain: string): string {
  return join(config.storePath, `${domain}.json`)
}

export function readStore(domain: string): DomainStore {
  const path = storePath(domain)
  if (!existsSync(path)) {
    return emptyStore(domain)
  }
  try {
    const raw = readFileSync(path, "utf-8")
    return JSON.parse(raw) as DomainStore
  } catch {
    return emptyStore(domain)
  }
}

export function emptyStore(domain: string): DomainStore {
  return {
    domain,
    updated: new Date().toISOString(),
    runs: 0,
    successRate: 0,
    hints: [],
    history: [],
  }
}

export function applyDecay(store: DomainStore): DomainStore {
  const now = new Date()
  const decayMs = config.decayDays * 24 * 60 * 60 * 1000

  const hints = store.hints.map((hint) => {
    const last = new Date(hint.last)
    const age = now.getTime() - last.getTime()
    if (age > decayMs) {
      return { ...hint, confidence: hint.confidence * 0.5 }
    }
    return hint
  })

  return { ...store, hints }
}

export function filterHints(store: DomainStore): Hint[] {
  return store.hints
    .filter((h) => h.confidence >= config.minConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, config.maxHints)
}
