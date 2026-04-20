import OpenAI from "openai";
import { readStore, applyDecay } from "../store/reader.js";
import { mergeHints, updateRunStats, writeStore } from "../store/writer.js";
import { MOCK_ENABLED, getMockHints } from "./mock.js";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
- Hints must describe site behaviour, NOT the specific goal or search query — strip all goal-specific
  details (names, topics, search terms). A hint must apply to ANY future goal on this domain.
  BAD:  "Use DuckDuckGo to find Elon Musk tweets"
  GOOD: "X.com login wall blocks all direct access — use DuckDuckGo to find Twitter content"
- If the run succeeded cleanly with no notable patterns, return []
- If the run took a long time (>60s) and the agent tried multiple approaches before one worked,
  extract a "flow" hint describing the shortcut that eventually succeeded — so future runs skip
  the failed attempts and go straight to what worked (e.g. "use DuckDuckGo instead of site search")
- Return ONLY valid JSON — no markdown, no explanation`;
export async function record(outcome) {
    const { domain, success, steps, errors, raw, goal } = outcome;
    // Build a compact summary for the LLM
    const durationSec = outcome.durationMs ? Math.round(outcome.durationMs / 1000) : null;
    const summary = [
        `Domain: ${domain}`,
        `Goal: ${goal}`,
        `Outcome: ${success ? "SUCCESS" : "FAILURE"}`,
        durationSec !== null ? `Duration: ${durationSec}s${durationSec > 60 ? " (SLOW — agent tried multiple approaches)" : ""}` : "",
        `Steps completed: ${steps.join(" → ") || "none"}`,
        errors.length ? `Errors: ${errors.join("; ")}` : "",
        `Agent response excerpt:\n${raw.slice(0, 2000)}`,
    ].filter(Boolean).join("\n");
    let newHints = [];
    if (MOCK_ENABLED) {
        newHints = getMockHints(steps, errors);
    }
    else {
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                max_tokens: 800,
                messages: [
                    { role: "system", content: EXTRACT_SYSTEM },
                    { role: "user", content: summary },
                ],
            });
            const text = response.choices[0]?.message?.content ?? "[]";
            if (process.env.MYCELIUM_DEBUG)
                console.log("[RECORDER GPT]", text);
            const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
            newHints = Array.isArray(parsed) ? parsed : [];
        }
        catch (e) {
            if (process.env.MYCELIUM_DEBUG)
                console.log("[RECORDER ERROR]", e);
            newHints = [];
        }
    }
    // Read, decay, merge, update stats, write
    const store = applyDecay(readStore(domain));
    // Merge, update stats, write
    const withHints = mergeHints(store, newHints);
    const withStats = updateRunStats(withHints, success, {
        goal,
        success,
        hintsUsed: store.hints.filter(h => h.confidence >= 0.6).length,
        hintsAdded: newHints.length,
        durationMs: outcome.durationMs,
    });
    writeStore(withStats);
    return {
        hintsExtracted: newHints.length,
        hintsTotal: withStats.hints.length,
    };
}
//# sourceMappingURL=recorder.js.map