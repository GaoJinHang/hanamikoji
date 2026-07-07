/**
 * Engine - replay helpers (pure, no IO)
 *
 * Use this to support:
 * - deterministic unit tests
 * - state replay / time-travel debugging
 */
import { EngineAction, EngineState } from './types';
/**
 * Replay a list of EngineAction events from an initial EngineState.
 * This is deterministic as long as the input actions are deterministic.
 */
export declare function replay(initial: EngineState, actions: EngineAction[]): EngineState;
/**
 * Replay a full game deterministically from (seed + actions).
 * Same seed + same actions => same final EngineState.
 *
 * NOTE: For tests/replay, we use stable dummy room/players.
 */
export declare function replayGame(seed: number, actions: EngineAction[]): EngineState;
//# sourceMappingURL=replay.d.ts.map