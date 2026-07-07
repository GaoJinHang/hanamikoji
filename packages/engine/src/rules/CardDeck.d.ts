/**
 * Engine rules - CardDeck compatibility helpers.
 *
 * New code should prefer rules/deck + rules/rng. This file remains as a thin
 * compatibility layer for older imports.
 */
import type { ItemCard } from '@hanamikoji/shared';
import type { RNGState } from './rng';
export type { RNGState } from './rng';
export { nextRNG } from './rng';
/** Draw from the top (last element) immutably. */
export declare function drawCard<T>(deck: readonly T[]): {
    card: T | null;
    deck: T[];
};
/** Remove a card by id immutably. */
export declare function removeCardFromDeck<T extends {
    id: string;
}>(deck: readonly T[], cardId: string): T[];
/** Create initial deck (ItemCard[]) deterministically. */
export declare function createInitialDeck(rngState: RNGState): {
    deck: ItemCard[];
    rngState: RNGState;
};
//# sourceMappingURL=CardDeck.d.ts.map