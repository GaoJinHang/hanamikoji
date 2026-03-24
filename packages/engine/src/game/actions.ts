/**
 * Engine - action creators (optional utility)
 */
import { ActionType, PlayerId } from '@hanamikoji/shared';
import { EngineAction, RoundSetupPayload } from './types';

export const EngineActions = {
  drawCard: (playerId: PlayerId): EngineAction => ({ type: 'DRAW_CARD', playerId }),
  playAction: (
    playerId: PlayerId,
    actionType: ActionType,
    cardIds: string[],
    grouping?: string[][],
    roundSetup?: RoundSetupPayload
  ): EngineAction => ({ type: 'PLAY_ACTION', playerId, actionType, cardIds, grouping, roundSetup }),
  resolveAction: (playerId: PlayerId, selection: number, roundSetup?: RoundSetupPayload): EngineAction => ({
    type: 'RESOLVE_ACTION',
    playerId,
    selection,
    roundSetup,
  }),
  applyRoundSetup: (deck: string[], hands: { p1: string[]; p2: string[] }): EngineAction => ({ type: 'APPLY_ROUND_SETUP', deck, hands }),
  setConnected: (playerId: PlayerId, connected: boolean, socketId?: string): EngineAction => ({ type: 'SET_CONNECTED', playerId, connected, socketId }),
} as const;
