import type { EngineState } from '@hanamikoji/engine';
import type { PlayerId, RoomPlayer } from '@hanamikoji/shared';
import type { ServerMessage } from './protocol';
import type { ISocket } from '../socket/ISocket';

export interface ConnectionContext {
  connectionId: string;
  socket: ISocket;
  roomId: string | null;
  playerId: PlayerId | null;
  clientPlayerId: string | null;
  playerName: string | null;
}

export interface RoomSeat {
  socket: ISocket | null;
  connectionId: string;
  clientPlayerId: string;
  player: RoomPlayer;
  connected: boolean;
}

export interface RoomRecord<TGameState = EngineState> {
  roomId: string;
  maxPlayers: number;
  createdAt: number;
  seats: Partial<Record<PlayerId, RoomSeat>>;
  gameState: TGameState | null;
}

export interface JoinRoomParams {
  roomId?: string | null;
  socket: ISocket;
  connectionId: string;
  clientPlayerId: string;
  name: string;
}

export interface JoinRoomResult<TGameState = EngineState> {
  room: RoomRecord<TGameState>;
  seat: RoomSeat;
  createdRoom: boolean;
  reconnected: boolean;
}

export interface BroadcastTarget {
  kind: 'broadcast' | 'player';
  message: ServerMessage;
  playerId?: PlayerId;
}
