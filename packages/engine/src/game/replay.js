import { reducer } from './reducer';
/**
 * Replay a list of EngineAction events from an initial EngineState.
 * This is deterministic as long as the input actions are deterministic.
 */
export function replay(initial, actions) {
    return actions.reduce((s, a) => reducer(s, a), initial);
}
import { initGame } from '../rules/deck';
/**
 * Replay a full game deterministically from (seed + actions).
 * Same seed + same actions => same final EngineState.
 *
 * NOTE: For tests/replay, we use stable dummy room/players.
 */
export function replayGame(seed, actions) {
    const players = {
        p1: { socketId: 'replay_p1', playerId: 'p1', name: 'P1' },
        p2: { socketId: 'replay_p2', playerId: 'p2', name: 'P2' },
    };
    let state = initGame(seed, 'room_replay', players, 'p1');
    for (const a of actions) {
        state = reducer(state, a);
    }
    return state;
}
//# sourceMappingURL=replay.js.map