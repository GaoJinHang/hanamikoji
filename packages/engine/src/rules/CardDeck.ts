/**
 * Engine rules - CardDeck compatibility helpers.
 *
 * New code should prefer rules/deck + rules/rng. This file remains as a thin
 * compatibility layer for older imports.
 */
import type { ItemCard } from '@hanamikoji/shared';
import { ITEM_CARDS } from './cards';
import { shuffleWithState } from './deck';
import type { RNGState } from './rng';
export type { RNGState } from './rng';
export { nextRNG } from './rng';

/** Draw from the top (last element) immutably. */
export function drawCard<T>(deck: readonly T[]): { card: T | null; deck: T[] } {
  if (deck.length === 0) return { card: null, deck: [...deck] };
  const card = deck[deck.length - 1] ?? null;
  return { card, deck: deck.slice(0, -1) };
}

/** Remove a card by id immutably. */
export function removeCardFromDeck<T extends { id: string }>(deck: readonly T[], cardId: string): T[] {
  return deck.filter(card => card.id !== cardId);
}

/** Create initial deck (ItemCard[]) deterministically. */
export function createInitialDeck(rngState: RNGState): { deck: ItemCard[]; rngState: RNGState } {
  const res = shuffleWithState([...ITEM_CARDS], rngState);
  return { deck: res.shuffled, rngState: res.rngState };
}
