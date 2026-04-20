import type { RunOutcome } from "../store/types.ts";
export interface RecordResult {
    hintsExtracted: number;
    hintsTotal: number;
}
export declare function record(outcome: RunOutcome): Promise<RecordResult>;
//# sourceMappingURL=recorder.d.ts.map