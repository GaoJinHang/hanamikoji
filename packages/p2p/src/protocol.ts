import type { ActionType, GameState, PlayerId, RoomPlayer } from '@hanamikoji/shared';

export type P2PMessageType =
  | 'HELLO'
  | 'JOIN_REQUEST'
  | 'JOIN_ACCEPT'
  | 'JOIN_REJECT'
  | 'LOBBY_STATE'
  | 'LOBBY_READY'
  | 'START_GAME_REQUEST'
  | 'START_GAME_REJECTED'
  | 'GAME_START'
  | 'ACTION_INTENT'
  | 'ACTION_ACCEPTED'
  | 'ACTION_REJECTED'
  | 'STATE_VIEW'
  | 'SYNC_REQUEST'
  | 'SYNC_RESPONSE'
  | 'PLAYER_DISCONNECTED'
  | 'PLAYER_RECONNECTED'
  | 'ERROR';

export type P2PProtocolVersion = 1;
export const P2P_PROTOCOL_VERSION: P2PProtocolVersion = 1;

export type P2PActionIntentPayload =
  | { type: 'DRAW_CARD' }
  | { type: 'PLAY_ACTION'; actionType: ActionType; cardIds: string[]; grouping?: string[][] }
  | { type: 'RESOLVE_ACTION'; selection: number };

export interface P2PEnvelope<T extends P2PMessage = P2PMessage> {
  fromPeerId: string;
  toPeerId: string;
  message: T;
}

export interface P2PMessageBase<T extends P2PMessageType> {
  type: T;
  protocolVersion: P2PProtocolVersion;
}

export interface HelloMessage extends P2PMessageBase<'HELLO'> {
  clientName?: string;
}

export interface JoinRequestMessage extends P2PMessageBase<'JOIN_REQUEST'> {
  clientName: string;
  requestedRoomId?: string;
  requestedPlayerId?: PlayerId;
  reconnectToken?: string;
  lastStateVersion?: number;
  lastViewHash?: string;
}

export interface JoinAcceptMessage extends P2PMessageBase<'JOIN_ACCEPT'> {
  roomId: string;
  playerId: PlayerId;
  reconnectToken: string;
  players: RoomPlayer[];
  resumed?: boolean;
}

export interface JoinRejectMessage extends P2PMessageBase<'JOIN_REJECT'> {
  reason: string;
  canRetry?: boolean;
}

export interface LobbyStateMessage extends P2PMessageBase<'LOBBY_STATE'> {
  roomId: string;
  players: RoomPlayer[];
  ready: Record<PlayerId, boolean>;
  canStart: boolean;
  hostPlayerId: PlayerId;
}

export interface LobbyReadyMessage extends P2PMessageBase<'LOBBY_READY'> {
  playerId: PlayerId;
  ready: boolean;
}

export interface StartGameRequestMessage extends P2PMessageBase<'START_GAME_REQUEST'> {
  actorId: PlayerId;
}

export interface StartGameRejectedMessage extends P2PMessageBase<'START_GAME_REJECTED'> {
  reason: string;
}

export interface GameStartMessage extends P2PMessageBase<'GAME_START'> {
  roomId: string;
  playerId: PlayerId;
  reconnectToken: string;
  players: RoomPlayer[];
  stateVersion: number;
  viewHash: string;
  previousStateVersion?: number;
  previousViewHash?: string;
  state: GameState;
}

export interface ActionIntentMessage extends P2PMessageBase<'ACTION_INTENT'> {
  requestId: string;
  actorId: PlayerId;
  stateVersion: number;
  previousViewHash: string;
  intent: P2PActionIntentPayload;
}

export interface ActionAcceptedMessage extends P2PMessageBase<'ACTION_ACCEPTED'> {
  requestId: string;
  actorId: PlayerId;
  previousStateVersion: number;
  stateVersion: number;
}

export interface ActionRejectedMessage extends P2PMessageBase<'ACTION_REJECTED'> {
  requestId: string;
  actorId?: PlayerId;
  reason: string;
  code: 'NOT_JOINED' | 'ACTOR_MISMATCH' | 'STALE_STATE' | 'INVALID_ACTION' | 'GAME_NOT_STARTED' | 'UNKNOWN';
  canSync: boolean;
  expectedStateVersion?: number;
  expectedPreviousViewHash?: string;
}

export interface StateViewMessage extends P2PMessageBase<'STATE_VIEW'> {
  roomId: string;
  playerId: PlayerId;
  stateVersion: number;
  viewHash: string;
  previousStateVersion?: number;
  previousViewHash?: string;
  state: GameState;
}

export interface SyncRequestMessage extends P2PMessageBase<'SYNC_REQUEST'> {
  playerId: PlayerId;
  stateVersion?: number;
  previousViewHash?: string;
}

export interface SyncResponseMessage extends P2PMessageBase<'SYNC_RESPONSE'> {
  roomId: string;
  playerId: PlayerId;
  stateVersion: number;
  viewHash: string;
  previousStateVersion?: number;
  previousViewHash?: string;
  state: GameState;
}

export interface PlayerDisconnectedMessage extends P2PMessageBase<'PLAYER_DISCONNECTED'> { playerId: PlayerId; reason?: string }
export interface PlayerReconnectedMessage extends P2PMessageBase<'PLAYER_RECONNECTED'> { playerId: PlayerId }
export interface ErrorMessage extends P2PMessageBase<'ERROR'> { code: string; message: string; canSync?: boolean }

export type P2PMessage =
  | HelloMessage
  | JoinRequestMessage
  | JoinAcceptMessage
  | JoinRejectMessage
  | LobbyStateMessage
  | LobbyReadyMessage
  | StartGameRequestMessage
  | StartGameRejectedMessage
  | GameStartMessage
  | ActionIntentMessage
  | ActionAcceptedMessage
  | ActionRejectedMessage
  | StateViewMessage
  | SyncRequestMessage
  | SyncResponseMessage
  | PlayerDisconnectedMessage
  | PlayerReconnectedMessage
  | ErrorMessage;


export type WebRTCSignalRole = 'host-offer' | 'player-answer';

export interface WebRTCSignalPayload {
  kind: 'hanamikoji-webrtc-signal';
  version: 1;
  role: WebRTCSignalRole;
  roomId: string;
  hostPeerId: string;
  remotePeerId: string;
  description: RTCSessionDescriptionInit;
  createdAt: number;
}

export function makeBase<T extends P2PMessageType>(type: T): P2PMessageBase<T> {
  return { type, protocolVersion: P2P_PROTOCOL_VERSION };
}
