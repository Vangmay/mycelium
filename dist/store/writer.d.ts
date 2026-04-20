import type { DomainStore, Hint, RunHistoryEntry } from "./types.ts";
export declare function writeStore(store: DomainStore): void;
export declare function mergeHints(store: DomainStore, newHints: Hint[]): DomainStore;
export declare function updateRunStats(store: DomainStore, success: boolean, entry: Omit<RunHistoryEntry, "ts">): DomainStore;
//# sourceMappingURL=writer.d.ts.map