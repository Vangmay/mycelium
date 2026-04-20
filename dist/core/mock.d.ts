import type { Hint } from "../store/types.ts";
export declare const MOCK_ENABLED: boolean;
interface MockResponse {
    success: boolean;
    data: any;
    steps: string[];
    errors: string[];
    raw: string;
}
export declare function getMockResponse(domain: string, goal: string): MockResponse;
export declare function getMockHints(steps: string[], errors: string[]): Omit<Hint, "id" | "seen" | "last">[];
export {};
//# sourceMappingURL=mock.d.ts.map