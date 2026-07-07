import crypto from 'crypto';
import type { PlayerId, RoomPlayer } from '@hanamikoji/shared';
import type { GameRoom } from './GameRoom';

export type StoredRoomPlayer = RoomPlayer & {
  reconnectToken: string;
  joinedAt: number;
  lastSeenAt: number;
};

export type RoomCtx = {
  roomId: string;
  players: { p1?: StoredRoomPlayer; p2?: StoredRoomPlayer };
  game?: GameRoom;
  createdAt: number;
  updatedAt: number;
};

export type JoinRoomResult =
  | { success: true; roomId: string; player: StoredRoomPlayer; reconnectToken: string; ctx: RoomCtx }
  | { success: false; message: string };

export type RoomCleanupReason = 'waiting_expired' | 'finished_expired' | 'disconnected_expired';

export interface RoomStoreOptions {
  waitingRoomTtlMs?: number;
  finishedRoomTtlMs?: number;
  disconnectedRoomTtlMs?: number;
  now?: () => number;
}

const DEFAULT_WAITING_ROOM_TTL_MS = 30 * 60 * 1000;
const DEFAULT_FINISHED_ROOM_TTL_MS = 30 * 60 * 1000;
const DEFAULT_DISCONNECTED_ROOM_TTL_MS = 2 * 60 * 60 * 1000;

export class RoomStore {
  private readonly rooms = new Map<string, RoomCtx>();
  private readonly waitingRoomTtlMs: number;
  private readonly finishedRoomTtlMs: number;
  private readonly disconnectedRoomTtlMs: number;
  private readonly now: () => number;

  constructor(options: RoomStoreOptions = {}) {
    this.waitingRoomTtlMs = options.waitingRoomTtlMs ?? DEFAULT_WAITING_ROOM_TTL_MS;
    this.finishedRoomTtlMs = options.finishedRoomTtlMs ?? DEFAULT_FINISHED_ROOM_TTL_MS;
    this.disconnectedRoomTtlMs = options.disconnectedRoomTtlMs ?? DEFAULT_DISCONNECTED_ROOM_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  createRoom(player: RoomPlayer): { roomId: string; player: StoredRoomPlayer; reconnectToken: string; ctx: RoomCtx } {
    const roomId = this.generateRoomId();
    const createdAt = this.now();
    const storedPlayer = this.createStoredPlayer({ ...player, playerId: 'p1' }, createdAt);
    const ctx: RoomCtx = {
      roomId,
      players: { p1: storedPlayer },
      createdAt,
      updatedAt: createdAt,
    };
    this.rooms.set(roomId, ctx);
    return { roomId, player: storedPlayer, reconnectToken: storedPlayer.reconnectToken, ctx };
  }

  join(socketId: string, playerName: string, requestedRoomId?: string | null): JoinRoomResult {
    const name = playerName.trim();
    if (!name) return { success: false, message: '请输入玩家名称' };

    if (requestedRoomId) {
      const roomId = requestedRoomId.trim().toUpperCase();
      const ctx = this.rooms.get(roomId);
      if (!ctx || ctx.players.p2 || ctx.game) {
        return { success: false, message: '房间不存在、已满或已开始' };
      }

      ctx.players.p2 = this.createStoredPlayer({ socketId, playerId: 'p2', name });
      this.touchRoom(ctx.roomId);
      return { success: true, roomId, player: ctx.players.p2, reconnectToken: ctx.players.p2.reconnectToken, ctx };
    }

    for (const ctx of this.rooms.values()) {
      if (ctx.players.p1 && !ctx.players.p2 && !ctx.game) {
        ctx.players.p2 = this.createStoredPlayer({ socketId, playerId: 'p2', name });
        this.touchRoom(ctx.roomId);
        return { success: true, roomId: ctx.roomId, player: ctx.players.p2, reconnectToken: ctx.players.p2.reconnectToken, ctx };
      }
    }

    return { success: true, ...this.createRoom({ socketId, playerId: 'p1', name }) };
  }

  get(roomId: string): RoomCtx | undefined {
    return this.rooms.get(roomId);
  }

  isRoomFull(ctx: RoomCtx): ctx is RoomCtx & { players: { p1: StoredRoomPlayer; p2: StoredRoomPlayer } } {
    return Boolean(ctx.players.p1 && ctx.players.p2);
  }

  setGame(roomId: string, game: GameRoom): void {
    const ctx = this.rooms.get(roomId);
    if (!ctx) return;
    ctx.game = game;
    this.touchRoom(roomId);
  }

  resume(roomId: string, playerId: PlayerId, reconnectToken: string, socketId: string): RoomCtx | undefined {
    const ctx = this.rooms.get(roomId);
    const player = ctx?.players[playerId];
    if (!ctx || !player || player.reconnectToken !== reconnectToken) return undefined;

    ctx.players[playerId] = { ...player, socketId, lastSeenAt: this.now() };
    this.touchRoom(roomId);
    return ctx;
  }

  removeWaitingPlayer(roomId: string, playerId: PlayerId): void {
    const ctx = this.rooms.get(roomId);
    if (!ctx || ctx.game) return;

    delete ctx.players[playerId];
    if (!ctx.players.p1 && !ctx.players.p2) {
      this.rooms.delete(roomId);
      return;
    }

    this.touchRoom(roomId);
  }

  touchRoom(roomId: string): void {
    const ctx = this.rooms.get(roomId);
    if (ctx) ctx.updatedAt = this.now();
  }

  cleanupExpiredRooms(): { roomId: string; reason: RoomCleanupReason }[] {
    const removed: { roomId: string; reason: RoomCleanupReason }[] = [];
    const now = this.now();

    for (const [roomId, ctx] of this.rooms.entries()) {
      const reason = this.getCleanupReason(ctx, now);
      if (!reason) continue;
      this.rooms.delete(roomId);
      removed.push({ roomId, reason });
    }

    return removed;
  }

  count(): number {
    return this.rooms.size;
  }

  info(): { roomId: string; playerCount: number; isFull: boolean; hasGame: boolean; updatedAt: number }[] {
    return Array.from(this.rooms.values()).map(ctx => {
      const playerCount = Number(Boolean(ctx.players.p1)) + Number(Boolean(ctx.players.p2));
      return {
        roomId: ctx.roomId,
        playerCount,
        isFull: this.isRoomFull(ctx),
        hasGame: Boolean(ctx.game),
        updatedAt: ctx.updatedAt,
      };
    });
  }

  private createStoredPlayer(player: RoomPlayer, timestamp = this.now()): StoredRoomPlayer {
    return {
      ...player,
      reconnectToken: this.generateReconnectToken(),
      joinedAt: timestamp,
      lastSeenAt: timestamp,
    };
  }

  private getCleanupReason(ctx: RoomCtx, now: number): RoomCleanupReason | null {
    const idleMs = now - ctx.updatedAt;

    if (!ctx.game) {
      return idleMs >= this.waitingRoomTtlMs ? 'waiting_expired' : null;
    }

    const state = ctx.game.getState();
    if (state.phase === 'game_over') {
      return idleMs >= this.finishedRoomTtlMs ? 'finished_expired' : null;
    }

    const bothDisconnected = !state.players.p1.connected && !state.players.p2.connected;
    if (bothDisconnected) {
      return idleMs >= this.disconnectedRoomTtlMs ? 'disconnected_expired' : null;
    }

    return null;
  }

  private generateRoomId(): string {
    let roomId = '';
    do {
      roomId = crypto.randomBytes(3).toString('hex').toUpperCase();
    } while (this.rooms.has(roomId));
    return roomId;
  }

  private generateReconnectToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}
