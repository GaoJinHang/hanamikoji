/**
 * Engine rules - Deck.
 *
 * This module owns deterministic shuffling/dealing only. It does not know about
 * sockets, rooms, or UI state, which keeps replays and tests reproducible.
 */

import type { RoomPlayer } from '@hanamikoji/shared';
import { ITEM_CARDS } from './cards';
import { type RNGState, createRNGState, nextRNG } from './rng';
import type { EngineState } from '../game/types';
import { initState } from '../game/initState';

type CardInput = string | { id: string };

function getCardId(card: CardInput): string {
  return typeof card === 'string' ? card : card.id;
}

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;

  Object.freeze(obj);
  const record = obj as Record<PropertyKey, unknown>;

  for (const key of Reflect.ownKeys(record)) {
    const value = record[key];
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }

  return obj;
}

/**
 * Deterministic shuffle that consumes and returns RNGState.
 */
export function shuffleWithState<T>(array: readonly T[], rngState: RNGState): { shuffled: T[]; rngState: RNGState } {
  const shuffled = [...array];
  let state = rngState >>> 0;

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const next = nextRNG(state);
    state = next.state;
    const j = Math.floor(next.value * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }

  return { shuffled, rngState: state };
}

/**
 * Deterministic shuffle convenience wrapper.
 */
export function shuffle<T>(array: readonly T[], rngState: RNGState): { shuffled: T[]; rngState: RNGState } {
  return shuffleWithState(array, rngState);
}

/**
 * Deal card ids to players after shuffling.
 */
export function dealCards<T extends CardInput>(
  cards: readonly T[],
  playerCount: number,
  cardsPerPlayer: number,
  rngState: RNGState
): { hands: string[][]; rngState: RNGState };
export function dealCards<T extends CardInput>(
  cards: readonly T[],
  playerCount: number,
  cardsPerPlayer: readonly unknown[][],
  rngState: RNGState
): { hands: string[][]; rngState: RNGState };
export function dealCards<T extends CardInput>(
  cards: readonly T[],
  playerCount: number,
  cardsPerPlayer: number | readonly unknown[][],
  rngState: RNGState
): { hands: string[][]; rngState: RNGState } {
  const { shuffled, rngState: nextState } = shuffleWithState(cards, rngState);
  const ids = shuffled.map(getCardId);

  if (typeof cardsPerPlayer === 'number') {
    const totalCards = cardsPerPlayer * playerCount;
    const picked = ids.slice(0, totalCards);
    const hands = Array.from({ length: playerCount }, (_, playerIndex) =>
      picked.filter((_, cardIndex) => cardIndex % playerCount === playerIndex)
    );
    return { hands, rngState: nextState };
  }

  // Compatibility path: use each inner array length as the hand size.
  let offset = 0;
  const hands = cardsPerPlayer.map((templateHand) => {
    const hand = ids.slice(offset, offset + templateHand.length);
    offset += templateHand.length;
    return hand;
  });

  return { hands, rngState: nextState };
}

function dealRoundCards(rngState: RNGState): { deck: string[]; hands: { p1: string[]; p2: string[] }; rngState: RNGState } {
  const cardIds = ITEM_CARDS.map(card => card.id);
  const { shuffled, rngState: nextState } = shuffleWithState(cardIds, rngState);

  // Remove one hidden card. The deck top is represented by the last element.
  const deckAfterHidden = shuffled.slice(0, -1);
  const deckLen = deckAfterHidden.length;
  const p1 = Array.from({ length: 6 }, (_, i) => deckAfterHidden[deckLen - 1 - i * 2]!);
  const p2 = Array.from({ length: 6 }, (_, i) => deckAfterHidden[deckLen - 2 - i * 2]!);
  const deck = deckAfterHidden.slice(0, deckLen - 12);

  return { deck, hands: { p1, p2 }, rngState: nextState };
}

/**
 * Create initial game setup.
 */
export function initGame(
  seed: number,
  roomId: string,
  players: { p1: RoomPlayer; p2: RoomPlayer },
  firstPlayer: 'p1' | 'p2' = 'p1'
): EngineState {
  const rngState = createRNGState(seed);
  const setup = dealRoundCards(rngState);

  const state = initState({
    roomId,
    players,
    hands: setup.hands,
    deck: setup.deck,
    firstPlayer,
    rngState: setup.rngState,
  });

  const devMode = typeof globalThis === 'object'
    && '__HANAMIKOJI_DEV__' in globalThis
    && Boolean((globalThis as Record<string, unknown>).__HANAMIKOJI_DEV__);

  if (devMode) {
    deepFreeze(state);
  }

  return state;
}

/**
 * Backwards-compatible alias. Keeping existing call sites working while enabling seed replay.
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
 * Create a new round setup with deterministic RNG state.
 */
export function createRoundSetup(rngState: RNGState): { deck: string[]; hands: { p1: string[]; p2: string[] }; rngState: RNGState } {
  return dealRoundCards(rngState);
}
