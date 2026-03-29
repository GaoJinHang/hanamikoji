import type { PlayerId, RoomPlayer } from '@hanamikoji/shared';
import type { ServerMessage } from './protocol';
import type { ISocket } from '../socket/ISocket';
import type { JoinRoomParams, JoinRoomResult, RoomRecord, RoomSeat } from './types';

function randomRoomId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function nextSeatId<TGameState>(room: RoomRecord<TGameState>): PlayerId {
  if (!room.seats.p1) return 'p1';
  if (!room.seats.p2) return 'p2';
  throw new Error('房间已满');
}

export class RoomManager<TGameState = unknown> {
  private readonly rooms = new Map<string, RoomRecord<TGameState>>();
  private readonly socketToRoom = new WeakMap<ISocket, string>();

  constructor(private readonly maxPlayers = 2) {}

  getRoom(roomId: string): RoomRecord<TGameState> | undefined {
    return this.rooms.get(roomId);
  }

  getRoomState(roomId: string): { roomId: string; players: RoomPlayer[]; hasGame: boolean } | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    return {
      roomId: room.roomId,
      players: this.getPlayers(roomId),
      hasGame: room.gameState !== null,
    };
  }

  listRooms(): Array<{ roomId: string; playerCount: number; hasGame: boolean }> {
    return Array.from(this.rooms.values()).map(room => ({
      roomId: room.roomId,
      playerCount: this.getPlayers(room.roomId).length,
      hasGame: room.gameState !== null,
    }));
  }

  joinRoom(params: JoinRoomParams): JoinRoomResult<TGameState> {
    const requestedRoomId = params.roomId?.trim().toUpperCase();
    let room: RoomRecord<TGameState> | undefined;
    let createdRoom = false;
    let reconnected = false;

    if (requestedRoomId) {
      room = this.rooms.get(requestedRoomId);
      if (!room) {
        throw new Error('房间不存在');
      }
    } else {
      room = this.findAvailableRoom();
      if (!room) {
        room = this.createRoom();
        createdRoom = true;
      }
    }

    // 检查是否已经有相同 clientPlayerId 的玩家在线（用于重连机制）
    // 但只在同一个房间内检查，避免阻止不同玩家加入不同房间
    const existingSeat = this.findSeatByClientPlayerId(room, params.clientPlayerId);
    if (existingSeat) {
      if (existingSeat.connected) {
        throw new Error('该玩家已在线');
      }
      // 重连逻辑：更新现有座位的连接信息
      existingSeat.socket = params.socket;
      existingSeat.connectionId = params.connectionId;
      existingSeat.connected = true;
      existingSeat.player.name = params.name;
      this.socketToRoom.set(params.socket, room.roomId);
      return { room, seat: existingSeat, createdRoom, reconnected: true };
    }

    if (this.getPlayers(room.roomId).length >= room.maxPlayers) {
      throw new Error('房间已满');
    }

    if (room.gameState) {
      throw new Error('游戏已开始');
    }

    const playerId = nextSeatId(room);
    const seat: RoomSeat = {
      socket: params.socket,
      connectionId: params.connectionId,
      clientPlayerId: params.clientPlayerId,
      connected: true,
      player: {
        socketId: params.connectionId,
        playerId,
        name: params.name,
      },
    };

    room.seats[playerId] = seat;
    this.socketToRoom.set(params.socket, room.roomId);
    return { room, seat, createdRoom, reconnected };
  }

  removeSocket(socket: ISocket): { room: RoomRecord<TGameState> | null; seat: RoomSeat | null; roomDeleted: boolean } {
    const roomId = this.socketToRoom.get(socket);
    if (!roomId) {
      return { room: null, seat: null, roomDeleted: false };
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      return { room: null, seat: null, roomDeleted: false };
    }

    const seatEntry = this.findSeatBySocket(room, socket);
    if (!seatEntry) {
      return { room, seat: null, roomDeleted: false };
    }

    const [playerId, seat] = seatEntry;

    if (room.gameState) {
      seat.connected = false;
      seat.socket = null;
    } else {
      delete room.seats[playerId];
    }

    const hasOccupiedSeat = Boolean(room.seats.p1 || room.seats.p2);
    const shouldDelete = !hasOccupiedSeat;

    if (shouldDelete) {
      this.rooms.delete(room.roomId);
    }

    return { room, seat, roomDeleted: shouldDelete };
  }

  setGameState(roomId: string, gameState: TGameState | null): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('房间不存在');
    }
    room.gameState = gameState;
  }

  broadcast(roomId: string, message: ServerMessage, excludeSocket?: ISocket): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    for (const seat of Object.values(room.seats)) {
      if (!seat || !seat.connected || !seat.socket) continue;
      if (excludeSocket && seat.socket === excludeSocket) continue;
      seat.socket.send(message);
    }
  }

  sendToPlayer(roomId: string, playerId: PlayerId, message: ServerMessage): void {
    const room = this.rooms.get(roomId);
    const seat = room?.seats[playerId];
    if (!seat || !seat.connected || !seat.socket) return;
    seat.socket.send(message);
  }

  getPlayers(roomId: string): RoomPlayer[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return (['p1', 'p2'] as const)
      .map(playerId => room.seats[playerId]?.player)
      .filter((player): player is RoomPlayer => Boolean(player));
  }

  isRoomFull(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    return Boolean(room?.seats.p1 && room?.seats.p2);
  }

  private createRoom(roomId = randomRoomId()): RoomRecord<TGameState> {
    const room: RoomRecord<TGameState> = {
      roomId,
      maxPlayers: this.maxPlayers,
      createdAt: Date.now(),
      seats: {},
      gameState: null,
    };
    this.rooms.set(roomId, room);
    return room;
  }

  private findAvailableRoom(): RoomRecord<TGameState> | undefined {
    return Array.from(this.rooms.values()).find(room => !room.gameState && this.getPlayers(room.roomId).length < room.maxPlayers);
  }

  private findSeatByClientPlayerId(room: RoomRecord<TGameState>, clientPlayerId: string): RoomSeat | undefined {
    return Object.values(room.seats).find(
      (seat): seat is RoomSeat => Boolean(seat && seat.clientPlayerId === clientPlayerId),
    );
  }

  private findSeatBySocket(room: RoomRecord<TGameState>, socket: ISocket): [PlayerId, RoomSeat] | null {
    for (const playerId of ['p1', 'p2'] as const) {
      const seat = room.seats[playerId];
      if (seat?.socket && seat.socket === socket) {
        return [playerId, seat];
      }
    }
    return null;
  }
}
