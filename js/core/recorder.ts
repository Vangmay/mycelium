import OpenAI from "openai"
import type { Hint, RunOutcome } from "../store/types.ts"
import { classifyOutcome, renderSymptoms } from "../analyzer/classifier.ts"
import { recordToGraph } from "../store/graph/writer.ts"

const EXTRACT_SYSTEM = `You are an expert at extracting reusable web automation hints from agent run logs.
Given a TinyFish web agent run result, extract a JSON array of hints that would help future runs succeed.

Each hint must follow this schema:
{
  "type": "blocker" | "selector" | "timing" | "flow" | "failure" | "auth" | "rate_limit",
  "tags": ["short_snake_case_tag"],
  "note": "concise description of what was learned (max 100 chars)",
  "action": "specific instruction for the agent to follow (max 150 chars)",
  "confidence": 0.65
}

Hint type guide:
- "blocker"    = cookie banners, login walls, popups that must be dismissed first
- "selector"   = stable CSS selectors or element identifiers worth remembering
- "timing"     = elements that lazy-load or require waits before interacting
- "flow"       = multi-step navigation patterns that work reliably
- "failure"    = patterns that caused failures and must be avoided next time
- "auth"       = login or session flow steps (navigation steps ONLY — never store credentials)
- "rate_limit" = throttling signals and delays that helped avoid blocks

Rules:
- Only extract hints that are domain-specific and reusable across sessions
- Hints must describe site behaviour, NOT the specific goal or search query — strip all goal-specific
  details (names, topics, search terms). A hint must apply to ANY future goal on this domain.
  BAD:  "Use DuckDuckGo to find Elon Musk tweets"
  GOOD: "X.com login wall blocks all direct access — use DuckDuckGo to find Twitter content"
- If the run succeeded cleanly with no notable patterns, return []
- If the run took a long time (>60s) and the agent tried multiple approaches before one worked,
  extract a "flow" hint describing the shortcut that eventually succeeded — so future runs skip
  the failed attempts and go straight to what worked (e.g. "use DuckDuckGo instead of site search")
- Return ONLY valid JSON — no markdown, no explanation`

const HINT_TYPES = new Set(["blocker", "selector", "timing", "flow", "failure", "auth", "rate_limit"])

export interface RecordResult {
  hintsExtracted: number
  hintsTotal: number
}

export interface RecordOptions {
  hintsUsedIds?: string[]
  llmExtract?: boolean
}

export async function record(outcome: RunOutcome, opts: RecordOptions = {}): Promise<RecordResult> {
  const { domain, success, steps, errors, raw, goal } = outcome
  const classification = classifyOutcome(outcome)

  const durationSec = outcome.durationMs ? Math.round(outcome.durationMs / 1000) : null
  const summary = [
    `Domain: ${domain}`,
    `Goal: ${goal}`,
    `Outcome: ${success ? "SUCCESS" : "FAILURE"}`,
    durationSec !== null ? `Duration: ${durationSec}s${durationSec > 60 ? " (SLOW — agent tried multiple approaches)" : ""}` : "",
    `Steps completed: ${steps.join(" → ") || "none"}`,
    errors.length ? `Errors: ${errors.join("; ")}` : "",
    `Detected reusable symptoms:\n${renderSymptoms(classification.symptoms)}`,
    `Agent response excerpt:\n${raw.slice(0, 2000)}`,
  ].filter(Boolean).join("\n")

  let llmHints: Hint[] = []

  if (shouldRunLlmExtraction(opts.llmExtract)) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 800,
        messages: [
          { role: "system", content: EXTRACT_SYSTEM },
          { role: "user", content: summary },
        ],
      })

      const text = response.choices[0]?.message?.content ?? "[]"
      if (process.env.MYCELIUM_DEBUG) console.log("[RECORDER GPT]", text)
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim())
      llmHints = Array.isArray(parsed) ? normalizeHints(parsed, "auto") : []
    } catch (e) {
      if (process.env.MYCELIUM_DEBUG) console.log("[RECORDER ERROR]", e)
      llmHints = []
    }
  }

  const newHints = mergeHints([...classification.hints, ...llmHints])

  const result = await recordToGraph({
    outcome,
    hints: newHints,
    hintsUsedIds: opts.hintsUsedIds,
  })

  return {
    hintsExtracted: result.hintsAdded,
    hintsTotal: result.hintsAdded + result.hintsConfirmed,
  }
}

function shouldRunLlmExtraction(override?: boolean): boolean {
  if (override !== undefined) return override && Boolean(process.env.OPENAI_API_KEY)

  const raw = (process.env.MYCELIUM_LLM_EXTRACT ?? "").toLowerCase()
  if (["0", "false", "off", "no"].includes(raw)) return false
  if (["1", "true", "on", "yes"].includes(raw)) return Boolean(process.env.OPENAI_API_KEY)

  // Optional by default: rules still produce hints when no OpenAI key is set.
  return Boolean(process.env.OPENAI_API_KEY)
}

function normalizeHints(items: unknown[], source: Hint["source"]): Hint[] {
  const today = new Date().toISOString().split("T")[0]
  const out: Hint[] = []

  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const raw = item as Record<string, unknown>
    if (typeof raw.type !== "string" || !HINT_TYPES.has(raw.type)) continue
    if (typeof raw.note !== "string" || typeof raw.action !== "string") continue

    const tags = Array.isArray(raw.tags)
      ? raw.tags
          .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
          .map((t) => t.toLowerCase().replace(/[^a-z0-9_:-]+/g, "_").slice(0, 40))
          .filter(Boolean)
      : []
    const confidence = typeof raw.confidence === "number"
      ? Math.max(0.1, Math.min(0.99, raw.confidence))
      : 0.65

    out.push({
      id: "",
      type: raw.type as Hint["type"],
      note: raw.note.trim().slice(0, 160),
      action: raw.action.trim().slice(0, 220),
      confidence,
      seen: 1,
      last: today,
      source,
      tags,
    })
  }

  return out
}

function mergeHints(hints: Hint[]): Hint[] {
  const byKey = new Map<string, Hint>()
  for (const h of hints) {
    const key = `${h.type}:${h.note.toLowerCase().replace(/\s+/g, " ").trim()}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, h)
      continue
    }
    byKey.set(key, {
      ...existing,
      confidence: Math.max(existing.confidence, h.confidence),
      source: existing.source === "rule" ? existing.source : h.source,
      tags: [...new Set([...(existing.tags ?? []), ...(h.tags ?? [])])],
    })
  }
  return [...byKey.values()]
}
