/**
 * Socket.io game gateway.
 *
 * This layer owns transport concerns only: connection identity, room membership,
 * client notifications and per-player state masking. Game transitions stay inside
 * @hanamikoji/engine and room matching stays inside RoomStore.
 */
import crypto from 'crypto';
import type { Server, Socket } from 'socket.io';
import type {
  ActionType,
  ClientToServerEvents,
  GamePhase,
  GameState,
  JoinRoomResponse,
  PlayerId,
  RoomPlayer,
  ServerToClientEvents,
} from '@hanamikoji/shared';
import { createGameSetup, type EngineAction, type EngineState } from '@hanamikoji/engine';
import { GameRoom } from '../game/GameRoom';
import type { RoomCtx, StoredRoomPlayer } from '../game/RoomStore';
import { RoomStore } from '../game/RoomStore';
import { createPlayerView } from '../game/playerView';
import { validateJoinRoom, validatePlayAction, validateResolveAction, validateResumeGame } from './validation';

const roomStore = new RoomStore();
const PLAYER_IDS = ['p1', 'p2'] as const satisfies readonly PlayerId[];
const CLEANUP_INTERVAL_MS = 60 * 1000;

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

type ClientContext = {
  roomId: string | null;
  playerId: PlayerId | null;
};

function createSeed(): number {
  return crypto.randomBytes(4).readUInt32LE(0);
}

function hasPlayerContext(context: ClientContext): context is { roomId: string; playerId: PlayerId } {
  return Boolean(context.roomId && context.playerId);
}

function getClientRoom(context: ClientContext): RoomCtx | null {
  if (!hasPlayerContext(context)) return null;
  return roomStore.get(context.roomId) ?? null;
}

function clearClientContext(context: ClientContext): void {
  context.roomId = null;
  context.playerId = null;
}

function toPublicRoomPlayer(player: StoredRoomPlayer): RoomPlayer {
  return {
    socketId: player.socketId,
    playerId: player.playerId,
    name: player.name,
  };
}

function replyJoin(callback: ((response: JoinRoomResponse) => void) | undefined, response: JoinRoomResponse): void {
  if (typeof callback === 'function') callback(response);
}

function emitGameStateToPlayer(io: TypedServer, state: GameState, playerId: PlayerId): void {
  const socketId = state.players[playerId].socketId;
  if (!socketId) return;
  io.to(socketId).emit('gameStateUpdate', createPlayerView(state, playerId));
}

function emitGameStartedToPlayer(io: TypedServer, state: GameState, playerId: PlayerId, reconnectToken: string): void {
  const socketId = state.players[playerId].socketId;
  if (!socketId) return;
  io.to(socketId).emit('gameStarted', createPlayerView(state, playerId), playerId, reconnectToken);
}

function broadcastGameState(io: TypedServer, state: GameState): void {
  for (const playerId of PLAYER_IDS) {
    emitGameStateToPlayer(io, state, playerId);
  }
}

function emitGameOver(io: TypedServer, roomId: string, state: GameState): void {
  io.to(roomId).emit('gameOver', {
    winner: state.winner,
    isDraw: state.isDraw,
    reason: state.reason || '游戏结束',
    finalScores: {
      p1: { geishaCount: state.players.p1.geishaCount, totalCharm: state.players.p1.totalCharm },
      p2: { geishaCount: state.players.p2.geishaCount, totalCharm: state.players.p2.totalCharm },
    },
  });
}

function emitPhaseHint(io: TypedServer, state: GameState, phase: GamePhase = state.phase): void {
  const targetSocketId = state.players[state.activePlayer].socketId;
  if (targetSocketId) {
    io.to(targetSocketId).emit('phaseChanged', phase, state.activePlayer);
  }
}

function emitChoiceRequired(io: TypedServer, state: GameState): void {
  const pendingAction = state.pendingAction;
  if (!pendingAction) return;

  const chooserSocketId = state.players[pendingAction.chooser].socketId;
  if (chooserSocketId) {
    io.to(chooserSocketId).emit('choiceRequired', pendingAction);
  }
}

function emitPostDispatchEvents(io: TypedServer, roomId: string, state: GameState): void {
  roomStore.touchRoom(roomId);

  if (state.phase === 'game_over') {
    emitGameOver(io, roomId, state);
    return;
  }

  if (state.pendingAction) {
    emitChoiceRequired(io, state);
    return;
  }

  emitPhaseHint(io, state);
}

function dispatchForClient(io: TypedServer, context: ClientContext, action: EngineAction): EngineState {
  const ctx = getClientRoom(context);
  if (!ctx?.game || !hasPlayerContext(context)) throw new Error('当前不在有效游戏房间中');

  const next = ctx.game.dispatch(action);
  emitPostDispatchEvents(io, context.roomId, next.gameState);
  return next;
}

function startGameIfReady(io: TypedServer, ctx: RoomCtx): void {
  if (!roomStore.isRoomFull(ctx) || ctx.game) return;

  const engineState = createGameSetup(ctx.roomId, { p1: ctx.players.p1, p2: ctx.players.p2 }, 'p1', createSeed());
  const game = new GameRoom(engineState, state => broadcastGameState(io, state));
  roomStore.setGame(ctx.roomId, game);

  for (const playerId of PLAYER_IDS) {
    emitGameStartedToPlayer(io, engineState.gameState, playerId, ctx.players[playerId].reconnectToken);
  }
}

function attachToRoom(socket: TypedSocket, context: ClientContext, roomId: string, playerId: PlayerId): void {
  context.roomId = roomId;
  context.playerId = playerId;
  socket.join(roomId);
}

export function setupSocket(io: TypedServer): void {
  const cleanupTimer = setInterval(() => {
    const removedRooms = roomStore.cleanupExpiredRooms();
    for (const removed of removedRooms) {
      console.log(`Cleaned room ${removed.roomId}: ${removed.reason}`);
    }
  }, CLEANUP_INTERVAL_MS);
  const maybeNodeTimer = cleanupTimer as unknown as { unref?: () => void };
  maybeNodeTimer.unref?.();

  io.on('connection', (socket: TypedSocket) => {
    console.log(`Socket connected: ${socket.id}`);

    const context: ClientContext = { roomId: null, playerId: null };

    socket.on('joinRoom', (roomId: string | null, playerName: string, callback: (response: JoinRoomResponse) => void) => {
      const validated = validateJoinRoom(roomId, playerName);
      if (!validated.ok) {
        replyJoin(callback, { success: false, message: validated.message });
        return;
      }

      const result = roomStore.join(socket.id, validated.value.playerName, validated.value.roomId);
      if (!result.success) {
        replyJoin(callback, { success: false, message: result.message });
        return;
      }

      attachToRoom(socket, context, result.roomId, result.player.playerId);
      socket.to(result.roomId).emit('playerJoined', toPublicRoomPlayer(result.player));
      startGameIfReady(io, result.ctx);

      replyJoin(callback, {
        success: true,
        roomId: result.roomId,
        playerId: result.player.playerId,
        reconnectToken: result.reconnectToken,
      });
      console.log(`Player ${result.player.name} joined room ${result.roomId} as ${result.player.playerId}`);
    });

    socket.on('leaveRoom', () => {
      handleLeave('leave');
    });

    socket.on('drawCard', () => {
      if (!hasPlayerContext(context)) return;
      try {
        dispatchForClient(io, context, { type: 'DRAW_CARD', playerId: context.playerId });
        socket.emit('actionRequired', 'secret', 1, 4);
      } catch (error) {
        socket.emit('error', error instanceof Error ? error.message : '抽牌失败');
      }
    });

    socket.on('playAction', (data: { type: ActionType; cardIds: string[]; grouping?: string[][] }) => {
      if (!hasPlayerContext(context)) return;
      const validated = validatePlayAction(data);
      if (!validated.ok) {
        socket.emit('error', validated.message);
        return;
      }

      try {
        dispatchForClient(io, context, {
          type: 'PLAY_ACTION',
          playerId: context.playerId,
          actionType: validated.value.type,
          cardIds: validated.value.cardIds,
          grouping: validated.value.grouping,
        });
      } catch (error) {
        console.error(`playAction failed: ${error}`);
        socket.emit('error', error instanceof Error ? error.message : '行动执行失败');
      }
    });

    socket.on('resolveAction', (selection: number) => {
      if (!hasPlayerContext(context)) return;
      const validated = validateResolveAction(selection);
      if (!validated.ok) {
        socket.emit('error', validated.message);
        return;
      }

      try {
        dispatchForClient(io, context, { type: 'RESOLVE_ACTION', playerId: context.playerId, selection: validated.value });
      } catch (error) {
        console.error(`resolveAction failed: ${error}`);
        socket.emit('error', error instanceof Error ? error.message : '选择处理失败');
      }
    });

    socket.on('cancelAction', () => {
      socket.emit('error', '暂不支持取消已提交的行动');
    });

    socket.on('startGame', () => {
      const ctx = getClientRoom(context);
      if (ctx) startGameIfReady(io, ctx);
    });

    socket.on('resumeGame', (roomId: string, playerId: PlayerId, reconnectToken: string) => {
      const validated = validateResumeGame(roomId, playerId, reconnectToken);
      if (!validated.ok) {
        socket.emit('error', validated.message);
        return;
      }

      const ctx = roomStore.resume(validated.value.roomId, validated.value.playerId, validated.value.reconnectToken, socket.id);
      if (!ctx?.game) {
        socket.emit('error', '无法恢复房间，请重新加入');
        return;
      }

      attachToRoom(socket, context, validated.value.roomId, validated.value.playerId);
      ctx.game.dispatch({ type: 'SET_CONNECTED', playerId: validated.value.playerId, connected: true, socketId: socket.id });
      emitGameStateToPlayer(io, ctx.game.getState(), validated.value.playerId);
      socket.to(validated.value.roomId).emit('opponentReconnected');
    });

    socket.on('disconnect', () => {
      handleLeave('disconnect');
      console.log(`Socket disconnected: ${socket.id}`);
    });

    function handleLeave(reason: 'leave' | 'disconnect'): void {
      if (!hasPlayerContext(context)) return;

      const { roomId, playerId } = context;
      const ctx = roomStore.get(roomId);

      if (ctx?.game) {
        ctx.game.dispatch({ type: 'SET_CONNECTED', playerId, connected: false });
        roomStore.touchRoom(roomId);
        socket.to(roomId).emit('opponentDisconnected');
      } else {
        roomStore.removeWaitingPlayer(roomId, playerId);
        socket.to(roomId).emit('playerLeft', playerId);
      }

      socket.leave(roomId);
      clearClientContext(context);
      console.log(`Player ${playerId} ${reason} room ${roomId}`);
    }
  });
}

export function getRoomCount(): number {
  roomStore.cleanupExpiredRooms();
  return roomStore.count();
}

export function getAllRoomsInfo(): { roomId: string; playerCount: number; isFull: boolean; hasGame: boolean; updatedAt: number }[] {
  roomStore.cleanupExpiredRooms();
  return roomStore.info();
}
