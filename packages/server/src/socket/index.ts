/**
 * 花见小路 - Socket.io 事件处理入口
 * 管理客户端连接、处理游戏事件，协调游戏房间的创建和销毁
 */

import { Server, Socket } from 'socket.io';
import crypto from 'crypto';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  JoinRoomResponse,
  RoomPlayer,
  ActionType,
  PlayerId,
} from '@hanamikoji/shared';
import { GameRoom } from '../game/GameRoom';
import { createGameSetup, createRoundSetup } from '@hanamikoji/engine';

type RoomCtx = {
  roomId: string;
  players: { p1?: RoomPlayer; p2?: RoomPlayer };
  game?: GameRoom;
};

/**
 * 房间存储器
 * 使用 Map 存储房间ID到房间上下文的映射
 */
const rooms = new Map<string, RoomCtx>();

/**
 * 生成房间ID
 * 生成6位随机大写字母组合
 */
function generateRoomId(): string {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

/**
 * 创建新房间
 * @param player 第一位玩家
 * @returns 房间ID和玩家信息
 */
function createRoom(player: RoomPlayer): { roomId: string; player: RoomPlayer } {
  const roomId = generateRoomId();
  rooms.set(roomId, { roomId, players: { p1: player } });
  console.log(`🏠 创建新房间: ${roomId}`);
  return { roomId, player };
}

/**
 * 获取或创建房间
 * 优先加入已有房间，没有空房间时创建新房间
 * @param player 要加入的玩家
 * @returns 房间ID和玩家信息
 */
function getOrCreateRoom(player: RoomPlayer): { roomId: string; player: RoomPlayer } {
  for (const ctx of rooms.values()) {
    if (!ctx.players.p2 && !ctx.game && ctx.players.p1) {
      ctx.players.p2 = { ...player, playerId: 'p2' };
      console.log(`👤 玩家 ${player.name} 加入房间 ${ctx.roomId}`);
      return { roomId: ctx.roomId, player: ctx.players.p2 };
    }
  }
  return createRoom({ ...player, playerId: 'p1' });
}

function isRoomFull(ctx: RoomCtx): boolean {
  return !!ctx.players.p1 && !!ctx.players.p2;
}

/**
 * 设置 Socket.io 事件处理
 * @param io Socket.io 服务器实例
 */
export function setupSocket(io: Server<ClientToServerEvents, ServerToClientEvents>): void {
  io.on('connection', (socket: Socket) => {
    console.log(`🔌 客户端连接: ${socket.id}`);

    let currentRoomId: string | null = null;
    let currentPlayerId: 'p1' | 'p2' | null = null;

    // ----------------------------------------
    // 加入房间事件
    // ----------------------------------------
    socket.on('joinRoom', (roomId: string | null, playerName: string, callback: (response: JoinRoomResponse) => void) => {
      console.log(`📥 收到加入房间请求: ${playerName}, 房间ID: ${roomId || '自动分配'}`);

      let ctx: RoomCtx | undefined;
      let player: RoomPlayer | undefined;

      // 如果指定了房间ID，尝试加入该房间
      if (roomId) {
        ctx = rooms.get(roomId);
        if (ctx && !ctx.players.p2 && !ctx.game) {
          ctx.players.p2 = { socketId: socket.id, playerId: 'p2', name: playerName };
          player = ctx.players.p2;
          currentRoomId = roomId;
          currentPlayerId = 'p2';
        } else {
          callback?.({ success: false, message: '房间不存在、已满或已开始' });
          return;
        }
      } else {
        // 创建或加入现有房间
        const result = getOrCreateRoom({ socketId: socket.id, playerId: 'p1', name: playerName });
        ctx = rooms.get(result.roomId)!;
        player = result.player;
        currentRoomId = result.roomId;
        currentPlayerId = result.player.playerId;
      }

      // 绑定 Socket 到房间
      socket.join(currentRoomId!);

      // 通知房间内其他玩家
      socket.to(currentRoomId!).emit('playerJoined', {
        socketId: socket.id,
        playerId: currentPlayerId!,
        name: playerName,
      });

      // 如果房间已满，开始游戏（server 只调用 engine 创建游戏）
      if (ctx && isRoomFull(ctx) && !ctx.game) {
        const seed = crypto.randomBytes(4).readUInt32LE(0);
        const engineState = createGameSetup(ctx.roomId, { p1: ctx.players.p1!, p2: ctx.players.p2! }, 'p1', seed);

        ctx.game = new GameRoom(engineState, (s) => io.to(ctx!.roomId).emit('gameStateUpdate', s));

        // 为每个客户端发送其对应的 playerId，避免前端自行推断
        io.to(engineState.publicState.players.p1.socketId!).emit('gameStarted', engineState.publicState, 'p1');
        io.to(engineState.publicState.players.p2.socketId!).emit('gameStarted', engineState.publicState, 'p2');
        console.log(`🎮 游戏开始! 房间: ${currentRoomId}`);
      }

      callback?.({ success: true, roomId: currentRoomId! });
      console.log(`✅ 玩家 ${playerName} (${currentPlayerId}) 加入房间 ${currentRoomId}`);
    });

    // ----------------------------------------
    // 离开房间事件
    // ----------------------------------------
    socket.on('leaveRoom', () => {
      console.log(`📤 玩家请求离开房间: ${socket.id}`);
      handleLeave();
    });

    // ----------------------------------------
    // 抽牌事件
    // ----------------------------------------
    socket.on('drawCard', () => {
      if (!currentRoomId) return;
      const ctx = rooms.get(currentRoomId);
      if (!ctx?.game) return;

      try {
        const next = ctx.game.dispatch({ type: 'DRAW_CARD', playerId: currentPlayerId! });

        // 通知当前玩家可以执行行动
        io.to(socket.id).emit('actionRequired', 'secret', 1, 4);
        console.log(`🎴 玩家 ${currentPlayerId} 抽牌，当前阶段: ${next.publicState.phase}`);
      } catch (error) {
        socket.emit('error', error instanceof Error ? error.message : '抽牌失败');
      }
    });

    // ----------------------------------------
    // 执行行动事件
    // ----------------------------------------
    socket.on('playAction', (data: { type: ActionType; cardIds: string[]; grouping?: string[][] }) => {
      if (!currentRoomId) return;
      const ctx = rooms.get(currentRoomId);
      if (!ctx?.game) return;

      try {
        // round setup is deterministic inside reducer via state.rngState
          const roundSetup = undefined as any;
        const next = ctx.game.dispatch({
          type: 'PLAY_ACTION',
          playerId: currentPlayerId!,
          actionType: data.type,
          cardIds: data.cardIds,
          grouping: data.grouping,
          roundSetup,
        });

        if (next.publicState.pendingAction) {
          io.to(currentRoomId).emit('choiceRequired', next.publicState.pendingAction);
          console.log(`⚡ 玩家 ${currentPlayerId} 执行 ${data.type}，等待对手选择`);
        } else {
          const nextPlayer = next.publicState.activePlayer;
          const nextPhase = nextPlayer === 'p1' ? 'p1_draw' : 'p2_draw';
          const targetSocketId = next.publicState.players[nextPlayer].socketId;
          if (targetSocketId) io.to(targetSocketId).emit('phaseChanged', nextPhase, nextPlayer);
          console.log(`➡️ 行动完成，切换到玩家 ${nextPlayer}`);
        }
      } catch (error) {
        console.error(`❌ 行动执行错误: ${error}`);
        socket.emit('error', error instanceof Error ? error.message : '行动执行失败');
      }
    });

    // ----------------------------------------
    // 处理选择事件（赠予/竞争）
    // ----------------------------------------
    socket.on('resolveAction', (selection: number) => {
      if (!currentRoomId) return;
      const ctx = rooms.get(currentRoomId);
      if (!ctx?.game) return;

      try {
        // round setup is deterministic inside reducer via state.rngState
          const roundSetup = undefined as any;
        const next = ctx.game.dispatch({ type: 'RESOLVE_ACTION', playerId: currentPlayerId!, selection, roundSetup });

        const state = next.publicState;
        if (state.phase === 'game_over') {
          io.to(currentRoomId).emit('gameOver', { 
            winner: state.winner, 
            isDraw: state.isDraw, 
            reason: state.reason || '游戏结束',
            finalScores: {
              p1: { geishaCount: state.players.p1.geishaCount, totalCharm: state.players.p1.totalCharm },
              p2: { geishaCount: state.players.p2.geishaCount, totalCharm: state.players.p2.totalCharm }
            }
          });
          console.log(`🏆 游戏结束，获胜者: ${state.winner || '平局'}`);
        } else {
          const nextPlayer = state.activePlayer;
          const nextPhase = nextPlayer === 'p1' ? 'p1_draw' : 'p2_draw';
          const targetSocketId = state.players[nextPlayer].socketId;
          if (targetSocketId) io.to(targetSocketId).emit('phaseChanged', nextPhase, nextPlayer);
        }
      } catch (error) {
        console.error(`❌ 选择处理错误: ${error}`);
        socket.emit('error', error instanceof Error ? error.message : '选择处理失败');
      }
    });

    // ----------------------------------------
    // 取消行动事件
    // ----------------------------------------
    socket.on('cancelAction', () => {
      console.log(`❌ 玩家 ${currentPlayerId} 取消行动`);
      // 取消逻辑（如需）应作为 action 进入 reducer；此处保持占位
    });

    // ----------------------------------------
    // 断线处理
    // ----------------------------------------
    socket.on('disconnect', () => {
      console.log(`🔌 客户端断开连接: ${socket.id}`);
      handleLeave();

      // 通知对手
      if (currentRoomId) {
        socket.to(currentRoomId).emit('opponentDisconnected');
      }
    });

    // ----------------------------------------
    // 重连处理
    // ----------------------------------------
    socket.on('reconnect', (roomId: string, playerId: PlayerId) => {
      const ctx = rooms.get(roomId);
      if (ctx?.game) {
        ctx.game.dispatch({ type: 'SET_CONNECTED', playerId, connected: true, socketId: socket.id });
        socket.join(roomId);
        io.to(roomId).emit('opponentReconnected');
        console.log(`🔄 玩家 ${playerId} 重连成功`);
      }
    });

    // ----------------------------------------
    // 处理离开房间
    // ----------------------------------------
    function handleLeave() {
      if (!currentRoomId || !currentPlayerId) return;
      const ctx = rooms.get(currentRoomId);
      if (ctx?.game) ctx.game.dispatch({ type: 'SET_CONNECTED', playerId: currentPlayerId, connected: false });
      currentRoomId = null;
      currentPlayerId = null;
    }
  });
}

/**
 * 获取当前房间数量（调试用）
 */
export function getRoomCount(): number {
  return rooms.size;
}

/**
 * 获取所有房间信息（调试用）
 */
export function getAllRoomsInfo(): { roomId: string; playerCount: number; isFull: boolean }[] {
  return Array.from(rooms.values()).map((ctx) => {
    const playerCount = (ctx.players.p1 ? 1 : 0) + (ctx.players.p2 ? 1 : 0);
    return { roomId: ctx.roomId, playerCount, isFull: isRoomFull(ctx) };
  });
}
