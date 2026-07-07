/**
 * Engine rules - Deck.
 *
 * This module owns deterministic shuffling/dealing only. It does not know about
 * sockets, rooms, or UI state, which keeps replays and tests reproducible.
 */
import type { RoomPlayer } from '@hanamikoji/shared';
import { type RNGState } from './rng';
import type { EngineState } from '../game/types';
type CardInput = string | {
    id: string;
};
/**
 * Deterministic shuffle that consumes and returns RNGState.
 */
export declare function shuffleWithState<T>(array: readonly T[], rngState: RNGState): {
    shuffled: T[];
    rngState: RNGState;
};
/**
 * Deterministic shuffle convenience wrapper.
 */
export declare function shuffle<T>(array: readonly T[], rngState: RNGState): {
    shuffled: T[];
    rngState: RNGState;
};
/**
 * Deal card ids to players after shuffling.
 */
export declare function dealCards<T extends CardInput>(cards: readonly T[], playerCount: number, cardsPerPlayer: number, rngState: RNGState): {
    hands: string[][];
    rngState: RNGState;
};
export declare function dealCards<T extends CardInput>(cards: readonly T[], playerCount: number, cardsPerPlayer: readonly unknown[][], rngState: RNGState): {
    hands: string[][];
    rngState: RNGState;
};
/**
 * Create initial game setup.
 */
export declare function initGame(seed: number, roomId: string, players: {
    p1: RoomPlayer;
    p2: RoomPlayer;
}, firstPlayer?: 'p1' | 'p2'): EngineState;
/**
 * Backwards-compatible alias. Keeping existing call sites working while enabling seed replay.
 */
export declare function createGameSetup(roomId: string, players: {
    p1: RoomPlayer;
    p2: RoomPlayer;
}, firstPlayer?: 'p1' | 'p2', seed?: number): EngineState;
/**
 * Create a new round setup with deterministic RNG state.
 */
export declare function createRoundSetup(rngState: RNGState): {
    deck: string[];
    hands: {
        p1: string[];
        p2: string[];
    };
    rngState: RNGState;
};
export {};
//# sourceMappingURL=deck.d.ts.map