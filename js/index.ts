// Mycelium SDK — public API
// Provider-agnostic memory layer for web agents, backed by an embedded
// SQLite + sqlite-vec graph store.

export { run } from "./core/runner.ts"
export { prime, buildGoal } from "./core/prime.ts"
export { record } from "./core/recorder.ts"
export { classifyOutcome } from "./analyzer/classifier.ts"
export { tinyfishAdapter } from "./adapters/tinyfish.ts"
export { playwrightAdapter } from "./adapters/playwright.ts"
export { browserbaseAdapter } from "./adapters/browserbase.ts"
export {
  domainStats,
  listDomains,
  domainHints,
  domainHistory,
  clearDomain,
} from "./store/graph/queries.ts"
export type { RunOptions, RunResult } from "./core/runner.ts"
export type {
  AdapterHandler,
  AdapterHandlerResult,
  WebAgentAdapter,
  WebAgentRunInput,
  WebAgentRunResult,
} from "./adapters/types.ts"
export type { TinyFishAdapterOptions } from "./adapters/tinyfish.ts"
export type {
  PlaywrightAdapterOptions,
  PlaywrightHandlerContext,
} from "./adapters/playwright.ts"
export type {
  BrowserbaseAdapterOptions,
  BrowserbaseHandlerContext,
} from "./adapters/browserbase.ts"
export type { PrimeResult } from "./core/prime.ts"
export type { RecordResult, RecordOptions } from "./core/recorder.ts"
export type { Hint, RunOutcome, HintType } from "./store/types.ts"
export type { DomainStats, HistoryEntry } from "./store/graph/queries.ts"
export type { ClassificationResult, WebSymptom, WebSymptomName } from "./analyzer/classifier.ts"
