import type {
  ActionType,
  GamePhase,
  GameState,
  JoinRoomResponse,
  PendingAction,
  PlayerId,
  RoomPlayer,
} from '@hanamikoji/shared';

export interface JoinRoomPayload {
  roomId: string;
  /**
   * Stable client-side identity used for reconnect or session correlation.
   * This is NOT the in-game seat (p1/p2); the server assigns that separately.
   */
  playerId: string;
  name: string;
}

export type ClientMessage =
  | { type: 'joinRoom'; payload: JoinRoomPayload }
  | { type: 'leaveRoom' }
  | { type: 'drawCard' }
  | { type: 'playAction'; payload: { type: ActionType; cardIds: string[]; grouping?: string[][] } }
  | { type: 'resolveAction'; payload: { selection: number } }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'roomJoined'; payload: JoinRoomResponse & Partial<{ playerId: PlayerId; players: RoomPlayer[] }> }
  | { type: 'playerJoined'; payload: RoomPlayer }
  | { type: 'playerLeft'; payload: { playerId: PlayerId } }
  | { type: 'gameStarted'; payload: { state: GameState; playerId: PlayerId } }
  | { type: 'stateSync'; payload: GameState }
  | { type: 'phaseChanged'; payload: { phase: GamePhase; activePlayer: PlayerId } }
  | { type: 'choiceRequired'; payload: PendingAction }
  | { type: 'actionRequired'; payload: { type: ActionType; minCards: number; maxCards: number } }
  | { type: 'gameOver'; payload: {
      winner: PlayerId | null;
      isDraw: boolean;
      reason: string;
      finalScores: {
        p1: { geishaCount: number; totalCharm: number };
        p2: { geishaCount: number; totalCharm: number };
      };
    } }
  | { type: 'opponentDisconnected' }
  | { type: 'opponentReconnected' }
  | { type: 'pong' }
  | { type: 'error'; payload: { message: string } };

export type TransportMessage = ClientMessage | ServerMessage;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isClientMessage(value: unknown): value is ClientMessage {
  if (!isObjectRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  switch (value.type) {
    case 'joinRoom':
    case 'playAction':
    case 'resolveAction':
      return 'payload' in value;
    case 'leaveRoom':
    case 'drawCard':
    case 'ping':
      return true;
    default:
      return false;
  }
}

export function parseClientMessage(raw: unknown): ClientMessage | null {
  try {
    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw) as unknown;
      return isClientMessage(parsed) ? parsed : null;
    }

    if (raw instanceof ArrayBuffer) {
      const parsed = JSON.parse(new TextDecoder().decode(raw)) as unknown;
      return isClientMessage(parsed) ? parsed : null;
    }

    if (ArrayBuffer.isView(raw)) {
      const parsed = JSON.parse(new TextDecoder().decode(raw)) as unknown;
      return isClientMessage(parsed) ? parsed : null;
    }

    return isClientMessage(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function serializeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}
