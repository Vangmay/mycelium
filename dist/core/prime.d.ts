export interface PrimeResult {
    domain: string;
    hintsLoaded: number;
    promptBlock: string;
}
export declare function prime(domain: string, goal?: string): PrimeResult;
export declare function buildGoal(originalGoal: string, primeResult: PrimeResult): string;
//# sourceMappingURL=prime.d.ts.map