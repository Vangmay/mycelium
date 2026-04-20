export type HintType = "blocker" | "selector" | "timing" | "flow" | "failure" | "auth" | "rate_limit";
export interface Hint {
    id: string;
    type: HintType;
    note: string;
    action: string;
    confidence: number;
    seen: number;
    last: string;
}
export interface RunHistoryEntry {
    ts: string;
    goal: string;
    success: boolean;
    hintsUsed: number;
    hintsAdded: number;
    durationMs?: number;
}
export interface DomainStore {
    domain: string;
    updated: string;
    runs: number;
    successRate: number;
    hints: Hint[];
    history: RunHistoryEntry[];
}
export interface RunOutcome {
    domain: string;
    goal: string;
    success: boolean;
    steps: string[];
    errors: string[];
    raw: string;
    durationMs?: number;
}
//# sourceMappingURL=types.d.ts.map