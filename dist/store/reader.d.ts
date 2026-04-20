import type { DomainStore, Hint } from "./types.ts";
export declare function storePath(domain: string): string;
export declare function readStore(domain: string): DomainStore;
export declare function emptyStore(domain: string): DomainStore;
export declare function applyDecay(store: DomainStore): DomainStore;
export declare function filterHints(store: DomainStore, goal?: string): Hint[];
//# sourceMappingURL=reader.d.ts.map