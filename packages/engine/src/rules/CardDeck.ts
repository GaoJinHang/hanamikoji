/**
 * Engine rules - CardDeck
 * Pure, reducer-safe deck helpers (immutable + deterministic RNG).
 *
 * Constraints:
 * - Never mutate input arrays
 * - Never use randomness APIs / time APIs
 * - No splice / pop / push
 */
import { ItemCard } from '@hanamikoji/shared';
import { ITEM_CARDS } from './cards';

export type RNGState = number;

/**
 * Pure RNG step: (state) => { value, state }
 * Algorithm: mulberry32 (uint32 state)
 */
export function nextRNG(state: RNGState): { value: number; state: RNGState } {
  let a = state >>> 0;
  a = (a + 0x6D2B79F5) >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: a >>> 0 };
}

/**
 * Deterministic Fisher–Yates shuffle consuming/returning RNGState.
 */
export function shuffleWithState<T>(array: T[], rngState: RNGState): { shuffled: T[]; rngState: RNGState } {
  const shuffled = [...array];
  let s = rngState >>> 0;

  for (let i = shuffled.length - 1; i > 0; i--) {
    const n = nextRNG(s);
    s = n.state;
    const j = Math.floor(n.value * (i + 1));
    const tmp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = tmp;
  }

  return { shuffled, rngState: s };
}

/**
 * Draw from the top (last element) immutably.
 */
export function drawCard<T>(deck: T[]): { card: T | null; deck: T[] } {
  if (deck.length === 0) return { card: null, deck };
  const card = deck[deck.length - 1] ?? null;
  return { card, deck: deck.slice(0, -1) };
}

/**
 * Remove a card by id immutably.
 */
export function removeCardFromDeck<T extends { id: string }>(deck: T[], cardId: string): T[] {
  return deck.filter(card => card.id !== cardId);
}

/**
 * Create initial deck (ItemCard[]) deterministically.
 */
export function createInitialDeck(rngState: RNGState): { deck: ItemCard[]; rngState: RNGState } {
  const res = shuffleWithState([...ITEM_CARDS], rngState);
  return { deck: res.shuffled, rngState: res.rngState };
}
