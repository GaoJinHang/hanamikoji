/**
 * Engine - replay helpers (pure, no IO)
 *
 * Use this to support:
 * - deterministic unit tests
 * - state replay / time-travel debugging
 */
import { EngineAction, EngineState } from './types';
import { reducer } from './reducer';

/**
 * Replay a list of EngineAction events from an initial EngineState.
 * This is deterministic as long as the input actions are deterministic.
 */
export function replay(initial: EngineState, actions: EngineAction[]): EngineState {
  return actions.reduce((s, a) => reducer(s, a), initial);
}


import { initGame } from '../rules/deck';
import { RoomPlayer } from '@hanamikoji/shared';

/**
 * Replay a full game deterministically from (seed + actions).
 * Same seed + same actions => same final EngineState.
 *
 * NOTE: For tests/replay, we use stable dummy room/players.
 */
export function replayGame(seed: number, actions: EngineAction[]): EngineState {
  const players: { p1: RoomPlayer; p2: RoomPlayer } = {
    p1: { socketId: 'replay_p1', playerId: 'p1', name: 'P1' },
    p2: { socketId: 'replay_p2', playerId: 'p2', name: 'P2' },
  };

  let state = initGame(seed, 'room_replay', players, 'p1');
  for (const a of actions) {
    state = reducer(state, a);
  }
  return state;
}
