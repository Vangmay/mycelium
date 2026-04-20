import type { PrimeResult } from "./prime.ts";
import type { RecordResult } from "./recorder.ts";
export interface RunOptions {
    url: string;
    goal: string;
    silent?: boolean;
}
export interface RunResult {
    success: boolean;
    data: any;
    primed: PrimeResult;
    recorded: RecordResult;
    raw: string;
}
export declare function run(options: RunOptions): Promise<RunResult>;
//# sourceMappingURL=runner.d.ts.map