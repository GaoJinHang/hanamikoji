/**
 * Engine - core types (no socket/express dependency)
 */
import { ActionType, GameState, PendingAction, PlayerId } from '@hanamikoji/shared';

export interface EngineMeta {
  /** When true, server MAY dispatch APPLY_ROUND_SETUP (legacy orchestration). */
  needsRoundSetup: boolean;
}

export interface EngineState {
  /** The public game state that can be sent to clients. */
  publicState: GameState;
  /** Remaining deck card ids after dealing (hidden card already removed). */
  deck: string[];
  /** Internal meta flags for server orchestration (still pure). */
  meta: EngineMeta;
  rngState: number; 
}

export interface RoundSetupPayload {
  deck: string[];
  hands: { p1: string[]; p2: string[] };
}

/**
 * Reducer action definitions
 */
export type EngineAction =
  | { type: 'DRAW_CARD'; playerId: PlayerId }
  | { type: 'PLAY_ACTION'; playerId: PlayerId; actionType: ActionType; cardIds: string[]; grouping?: string[][]; roundSetup?: RoundSetupPayload }
  | { type: 'RESOLVE_ACTION'; playerId: PlayerId; selection: number; roundSetup?: RoundSetupPayload }
  | { type: 'APPLY_ROUND_SETUP'; deck: string[]; hands: { p1: string[]; p2: string[] } }
  | { type: 'SET_CONNECTED'; playerId: PlayerId; connected: boolean; socketId?: string };

export interface PlayActionResult {
  state: EngineState;
  requiresChoice: boolean;
  pendingAction?: PendingAction;
}
