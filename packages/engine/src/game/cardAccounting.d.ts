import type { EngineState } from './types';
export declare const EXPECTED_ACTIVE_CARD_COUNT: number;
export declare const EXPECTED_VISIBLE_CARD_COUNT: number;
export interface CardCountDetails {
    total: number;
    expected: number;
    duplicates: string[];
    details: Record<string, string[]>;
}
export declare function countCardsDetailed(state: EngineState): CardCountDetails;
export declare function countCards(state: EngineState): number;
export declare function assertCardAccounting(state: EngineState): void;
export declare const assertCardInvariants: typeof assertCardAccounting;
//# sourceMappingURL=cardAccounting.d.ts.map