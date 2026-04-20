import { existsSync, mkdirSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";
import { storePath } from "./reader.js";
import config from "../mycelium.config.js";
export function writeStore(store) {
    const dir = config.storePath;
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    const path = storePath(store.domain);
    writeFileSync(path, JSON.stringify(store, null, 2), "utf-8");
}
export function mergeHints(store, newHints) {
    const today = new Date().toISOString().split("T")[0];
    const existing = [...store.hints];
    for (const incoming of newHints) {
        // Try to find a matching hint by note similarity (simple includes check)
        const match = existing.find((h) => h.type === incoming.type &&
            (h.note.toLowerCase().includes(incoming.note.toLowerCase().slice(0, 20)) ||
                incoming.note.toLowerCase().includes(h.note.toLowerCase().slice(0, 20))));
        if (match) {
            // Confirmed — boost confidence and refresh last seen
            match.seen += 1;
            match.last = today;
            match.confidence = Math.min(0.99, match.confidence + 0.05);
            // Update action if the new one is more specific (longer)
            if (incoming.action.length > match.action.length) {
                match.action = incoming.action;
            }
        }
        else {
            // New hint — add with starting confidence
            existing.push({
                ...incoming,
                id: randomUUID().slice(0, 8),
                seen: 1,
                last: today,
                confidence: incoming.confidence ?? 0.65,
            });
        }
    }
    return {
        ...store,
        hints: existing,
        updated: new Date().toISOString(),
    };
}
export function updateRunStats(store, success, entry) {
    const runs = store.runs + 1;
    const prevTotal = store.successRate * store.runs;
    const successRate = (prevTotal + (success ? 1 : 0)) / runs;
    const historyEntry = {
        ts: new Date().toISOString(),
        ...entry,
    };
    return {
        ...store,
        runs,
        successRate,
        history: [...(store.history ?? []), historyEntry],
    };
}
//# sourceMappingURL=writer.js.map