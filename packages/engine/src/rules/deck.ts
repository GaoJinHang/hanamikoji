/**
 * Engine rules - Deck
 * Pure deck manipulation functions.
 */

import { RoomPlayer } from '@hanamikoji/shared';
import { ITEM_CARDS } from './cards';
import { RNGState, createRNGState, nextRNG } from './rng';
import { EngineState } from '../game/types';
import { initState } from '../game/initState';

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  // Freeze first to catch self-references early
  Object.freeze(obj);
  // Recurse
  for (const key of Object.keys(obj as any)) {
    const val = (obj as any)[key];
    if (val && typeof val === 'object' && !Object.isFrozen(val)) deepFreeze(val);
  }
  return obj;
}



/**
 * Deterministic shuffle (functional RNG).
 * Convenience wrapper around shuffleWithState.
 */
export function shuffle<T>(array: T[], rngState: RNGState): { shuffled: T[]; rngState: RNGState } {
  return shuffleWithState(array, rngState);
}


/**
 * Deal cards to players
 * @param cards Card array
 * @param playerCount Number of players
 * @param cardsPerPlayer Number of cards per player (or array of different counts)
 * @returns 2D array of hands
 */
export function dealCards(cards: any[], playerCount: number, cardsPerPlayer: number[][], rngState: RNGState): { hands: string[][]; rngState: RNGState };
export function dealCards(cards: any[], playerCount: number, cardsPerPlayer: number, rngState: RNGState): { hands: string[][]; rngState: RNGState };
export function dealCards(cards: any[], playerCount: number, cardsPerPlayer: number | number[][], rngState: RNGState): { hands: string[][]; rngState: RNGState } {
  const { shuffled, rngState: nextState } = shuffleWithState(cards, rngState);
  const ids: string[] = shuffled.map((c: any) => c?.id ?? c);

  if (typeof cardsPerPlayer === 'number') {
    const totalCards = cardsPerPlayer * playerCount;
    const picked = ids.slice(0, totalCards);

    const hands = Array.from({ length: playerCount }, (_, p) => picked.filter((_, idx) => idx % playerCount === p));
    return { hands, rngState: nextState };
  }

  // Different cards per player: use each inner array length as count (keeps previous behavior)
  const counts = cardsPerPlayer.map(arr => arr.length);
  let offset = 0;
  const hands = counts.map(count => {
    const hand = ids.slice(offset, offset + count);
    offset += count;
    return hand;
  });

  return { hands, rngState: nextState };
}


/**
 * Deterministic shuffle that consumes/returns RNGState (pure).
 * Use this inside reducer/init to keep referential transparency.
 */
export function shuffleWithState<T>(array: T[], rngState: RNGState): { shuffled: T[]; rngState: RNGState } {
  const shuffled = [...array];
  let s = rngState >>> 0;

  for (let i = shuffled.length - 1; i > 0; i--) {
    const n = nextRNG(s);
    s = n.state;
    const j = Math.floor(n.value * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return { shuffled, rngState: s };
}

/**
 * Create initial game setup
 * Shuffles deck, deals hands, removes hidden card
 * @param roomId Room ID
 * @param players Player information
 * @param firstPlayer First player (optional, defaults to p1)
 * @returns EngineState
 */
export function initGame(
  seed: number,
  roomId: string,
  players: { p1: RoomPlayer; p2: RoomPlayer },
  firstPlayer: 'p1' | 'p2' = 'p1'
): EngineState {
  let rngState = createRNGState(seed);

  // Shuffle deck deterministically
  const res = shuffleWithState([...ITEM_CARDS.map(c => c.id)], rngState);
  const shuffled = res.shuffled;
  rngState = res.rngState;

  // Remove hidden card (top of deck is last element)
  const deckAfterHidden = shuffled.slice(0, -1);

  // Deal 6 cards to each player by drawing from top (last) alternately: p1 then p2 (same as previous pop() order)
  const deckLen = deckAfterHidden.length;
  const p1Hand = Array.from({ length: 6 }, (_, i) => deckAfterHidden[deckLen - 1 - i * 2]!);
  const p2Hand = Array.from({ length: 6 }, (_, i) => deckAfterHidden[deckLen - 2 - i * 2]!);

  // Remaining deck after 12 draws
  const deck = deckAfterHidden.slice(0, deckLen - 12);

  const state = initState({
    roomId,
    players,
    hands: { p1: p1Hand, p2: p2Hand },
    deck,
    firstPlayer,
    rngState,
  });

  const devMode = typeof globalThis === 'object' && '__HANAMIKOJI_DEV__' in globalThis && Boolean((globalThis as Record<string, unknown>).__HANAMIKOJI_DEV__);
  if (devMode) {
    deepFreeze(state);
  }

  return state;
}

/**
 * Backwards-compatible alias.
 * (Keeping existing call sites working while enabling seed replay)
 */
export function createGameSetup(
  roomId: string,
  players: { p1: RoomPlayer; p2: RoomPlayer },
  firstPlayer: 'p1' | 'p2' = 'p1',
  seed: number = 0
): EngineState {
  return initGame(seed, roomId, players, firstPlayer);
}

/**
 * Create round setup (for new rounds)
 * @returns Round setup with deck and hands
 */
export function createRoundSetup(rngState: RNGState): { deck: string[]; hands: { p1: string[]; p2: string[] }; rngState: RNGState } {
  // Shuffle deck deterministically
  const res = shuffleWithState([...ITEM_CARDS.map(c => c.id)], rngState);
  const shuffled = res.shuffled;
  let s = res.rngState;

  // Remove hidden card
  const deckAfterHidden = shuffled.slice(0, -1);

  const deckLen = deckAfterHidden.length;
  const p1 = Array.from({ length: 6 }, (_, i) => deckAfterHidden[deckLen - 1 - i * 2]!);
  const p2 = Array.from({ length: 6 }, (_, i) => deckAfterHidden[deckLen - 2 - i * 2]!);
  const deck = deckAfterHidden.slice(0, deckLen - 12);

  return { deck, hands: { p1, p2 }, rngState: s };
}