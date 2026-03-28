import OpenAI from "openai"
import type { Hint, RunOutcome } from "../store/types.ts"
import { readStore, applyDecay } from "../store/reader.ts"
import { mergeHints, updateRunStats, writeStore } from "../store/writer.ts"
import { MOCK_ENABLED, getMockHints } from "./mock.ts"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const EXTRACT_SYSTEM = `You are an expert at extracting reusable web automation hints from agent run logs.
Given a TinyFish web agent run result, extract a JSON array of hints that would help future runs succeed.

Each hint must follow this schema:
{
  "type": "blocker" | "selector" | "timing" | "flow" | "failure" | "auth" | "rate_limit",
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
- If the run succeeded cleanly with no notable patterns, return []
- Return ONLY valid JSON — no markdown, no explanation`

export interface RecordResult {
  hintsExtracted: number
  hintsTotal: number
}

export async function record(outcome: RunOutcome): Promise<RecordResult> {
  const { domain, success, steps, errors, raw, goal } = outcome

  // Build a compact summary for the LLM
  const summary = [
    `Domain: ${domain}`,
    `Goal: ${goal}`,
    `Outcome: ${success ? "SUCCESS" : "FAILURE"}`,
    `Steps completed: ${steps.join(" → ") || "none"}`,
    errors.length ? `Errors: ${errors.join("; ")}` : "",
    `Agent response excerpt:\n${raw.slice(0, 2000)}`,
  ].filter(Boolean).join("\n")

  let newHints: Hint[] = []

  if (MOCK_ENABLED) {
    newHints = getMockHints(steps, errors) as Hint[]
  } else {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 800,
        messages: [
          { role: "system", content: EXTRACT_SYSTEM },
          { role: "user", content: summary },
        ],
      })

      const text = response.choices[0]?.message?.content ?? "[]"
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim())
      newHints = Array.isArray(parsed) ? parsed : []
    } catch (e) {
      // If extraction fails, continue silently — don't break the run
      newHints = []
    }
  }

  // Read, decay, merge, update stats, write
  const store = applyDecay(readStore(domain))
  const withHints = mergeHints(store, newHints)
  const withStats = updateRunStats(withHints, success, {
    goal,
    success,
    hintsUsed: store.hints.filter(h => h.confidence >= 0.6).length,
    hintsAdded: newHints.length,
    durationMs: outcome.durationMs,
  })
  writeStore(withStats)

  return {
    hintsExtracted: newHints.length,
    hintsTotal: withStats.hints.length,
  }
}
