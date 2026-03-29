import { createGameSetup, reducer, type EngineState } from '@hanamikoji/engine';
import type { ActionType, PlayerId, RoomPlayer } from '@hanamikoji/shared';
import type { BroadcastTarget } from '../core/types';

export interface EngineTransition {
  state: EngineState;
  messages: BroadcastTarget[];
}

function toStateSyncMessage(state: EngineState): BroadcastTarget {
  return {
    kind: 'broadcast',
    message: {
      type: 'stateSync',
      payload: state.publicState,
    },
  };
}

function toPhaseChangedMessage(state: EngineState): BroadcastTarget {
  return {
    kind: 'broadcast',
    message: {
      type: 'phaseChanged',
      payload: {
        phase: state.publicState.phase,
        activePlayer: state.publicState.activePlayer,
      },
    },
  };
}

function toGameOverMessage(state: EngineState): BroadcastTarget {
  return {
    kind: 'broadcast',
    message: {
      type: 'gameOver',
      payload: {
        winner: state.publicState.winner,
        isDraw: state.publicState.isDraw,
        reason: state.publicState.reason || '游戏结束',
        finalScores: {
          p1: {
            geishaCount: state.publicState.players.p1.geishaCount,
            totalCharm: state.publicState.players.p1.totalCharm,
          },
          p2: {
            geishaCount: state.publicState.players.p2.geishaCount,
            totalCharm: state.publicState.players.p2.totalCharm,
          },
        },
      },
    },
  };
}

function buildPostUpdateMessages(state: EngineState, actor: PlayerId, trigger: 'drawCard' | 'playAction' | 'resolveAction'): BroadcastTarget[] {
  const messages: BroadcastTarget[] = [toStateSyncMessage(state)];

  if (state.publicState.phase === 'game_over') {
    messages.push(toGameOverMessage(state));
    return messages;
  }

  if (trigger === 'drawCard') {
    messages.push({
      kind: 'player',
      playerId: actor,
      message: {
        type: 'actionRequired',
        payload: { type: 'secret', minCards: 1, maxCards: 4 },
      },
    });
    messages.push(toPhaseChangedMessage(state));
    return messages;
  }

  if (state.publicState.pendingAction) {
    messages.push({
      kind: 'player',
      playerId: state.publicState.pendingAction.chooser,
      message: {
        type: 'choiceRequired',
        payload: state.publicState.pendingAction,
      },
    });
    messages.push(toPhaseChangedMessage(state));
    return messages;
  }

  messages.push(toPhaseChangedMessage(state));
  return messages;
}

export function createNewGame(roomId: string, players: { p1: RoomPlayer; p2: RoomPlayer }, seed: number = Date.now()): EngineTransition {
  const state = createGameSetup(roomId, players, 'p1', seed);
  return {
    state,
    messages: [
      {
        kind: 'player',
        playerId: 'p1',
        message: { type: 'gameStarted', payload: { state: state.publicState, playerId: 'p1' } },
      },
      {
        kind: 'player',
        playerId: 'p2',
        message: { type: 'gameStarted', payload: { state: state.publicState, playerId: 'p2' } },
      },
      toStateSyncMessage(state),
      toPhaseChangedMessage(state),
    ],
  };
}

export function applyDrawCard(state: EngineState, playerId: PlayerId): EngineTransition {
  const nextState = reducer(state, { type: 'DRAW_CARD', playerId });
  return {
    state: nextState,
    messages: buildPostUpdateMessages(nextState, playerId, 'drawCard'),
  };
}

export function applyPlayAction(
  state: EngineState,
  playerId: PlayerId,
  action: { type: ActionType; cardIds: string[]; grouping?: string[][] },
): EngineTransition {
  const nextState = reducer(state, {
    type: 'PLAY_ACTION',
    playerId,
    actionType: action.type,
    cardIds: action.cardIds,
    grouping: action.grouping,
  });

  return {
    state: nextState,
    messages: buildPostUpdateMessages(nextState, playerId, 'playAction'),
  };
}

export function applyResolveAction(state: EngineState, playerId: PlayerId, selection: number): EngineTransition {
  const nextState = reducer(state, { type: 'RESOLVE_ACTION', playerId, selection });
  return {
    state: nextState,
    messages: buildPostUpdateMessages(nextState, playerId, 'resolveAction'),
  };
}

export function updateConnectionState(state: EngineState, playerId: PlayerId, connected: boolean, connectionId?: string): EngineTransition {
  const nextState = reducer(state, {
    type: 'SET_CONNECTED',
    playerId,
    connected,
    socketId: connectionId,
  });

  return {
    state: nextState,
    messages: [
      toStateSyncMessage(nextState),
      {
        kind: 'broadcast',
        message: connected ? { type: 'opponentReconnected' } : { type: 'opponentDisconnected' },
      },
    ],
  };
}
