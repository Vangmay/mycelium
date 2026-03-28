// Mycelium SDK — public API
// Drop-in wrapper around TinyFish with persistent domain memory

export { run } from "./core/runner.ts"
export { prime, buildGoal } from "./core/prime.ts"
export { record } from "./core/recorder.ts"
export { readStore, filterHints } from "./store/reader.ts"
export type { RunOptions, RunResult } from "./core/runner.ts"
export type { PrimeResult } from "./core/prime.ts"
export type { RecordResult } from "./core/recorder.ts"
export type { Hint, DomainStore, RunOutcome, HintType } from "./store/types.ts"
