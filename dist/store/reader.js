import { existsSync, readFileSync } from "fs";
import { join } from "path";
import config from "../mycelium.config.js";
export function storePath(domain) {
    return join(config.storePath, `${domain}.json`);
}
export function readStore(domain) {
    const path = storePath(domain);
    if (!existsSync(path)) {
        return emptyStore(domain);
    }
    try {
        const raw = readFileSync(path, "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return emptyStore(domain);
    }
}
export function emptyStore(domain) {
    return {
        domain,
        updated: new Date().toISOString(),
        runs: 0,
        successRate: 0,
        hints: [],
        history: [],
    };
}
export function applyDecay(store) {
    const now = new Date();
    const decayMs = config.decayDays * 24 * 60 * 60 * 1000;
    const hints = store.hints.map((hint) => {
        const last = new Date(hint.last);
        const age = now.getTime() - last.getTime();
        if (age > decayMs) {
            return { ...hint, confidence: hint.confidence * 0.5 };
        }
        return hint;
    });
    return { ...store, hints };
}
// Type priority: flow shortcuts and blockers first, noise last
const TYPE_PRIORITY = {
    flow: 0,
    blocker: 1,
    auth: 2,
    timing: 3,
    selector: 4,
    failure: 5,
    rate_limit: 6,
};
export function filterHints(store, goal) {
    const goalWords = goal
        ? new Set(goal.toLowerCase().split(/\W+/).filter((w) => w.length > 3))
        : new Set();
    // 1. Filter by minimum confidence
    const eligible = store.hints.filter((h) => h.confidence >= config.minConfidence);
    // 2. Score by goal relevance (keyword overlap with note + action)
    const scored = eligible.map((h) => {
        const text = `${h.note} ${h.action}`.toLowerCase();
        const overlap = goalWords.size > 0
            ? [...goalWords].filter((w) => text.includes(w)).length / goalWords.size
            : 0;
        return { hint: h, score: h.confidence + overlap * 0.2 };
    });
    // Types where multiple hints can coexist (complementary, not redundant)
    const MAX_PER_TYPE = {
        flow: 2, timing: 1, failure: 2,
        blocker: 1, auth: 1, selector: 1, rate_limit: 1,
    };
    // Drop timing hints that actively add delays — they slow the agent down
    const DELAY_WORDS = /\b(waits?|delays?|longer|pause|sleep)\b/i;
    const withoutSlowHints = scored.filter((e) => e.hint.type !== "timing" || !DELAY_WORDS.test(e.hint.action));
    // 3. Deduplicate by type — keep top N per type based on MAX_PER_TYPE
    const byType = new Map();
    for (const entry of withoutSlowHints) {
        const bucket = byType.get(entry.hint.type) ?? [];
        bucket.push(entry);
        byType.set(entry.hint.type, bucket);
    }
    const selected = [...byType.entries()].flatMap(([type, entries]) => {
        const limit = MAX_PER_TYPE[type] ?? 1;
        return entries
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    });
    // 4. Sort by type priority, then score
    return selected
        .sort((a, b) => {
        const pa = TYPE_PRIORITY[a.hint.type] ?? 99;
        const pb = TYPE_PRIORITY[b.hint.type] ?? 99;
        return pa !== pb ? pa - pb : b.score - a.score;
    })
        .slice(0, 6)
        .map((e) => e.hint);
}
//# sourceMappingURL=reader.js.map