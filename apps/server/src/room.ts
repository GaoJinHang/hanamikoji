/**
 * 花见小路 - Durable Object 游戏房间实现
 * 每个房间对应一个 DO 实例，维护两个玩家的连接和游戏状态
 */

import { createGameSetup, reducer, type EngineState } from '@hanamikoji/engine';
import type {
  PlayerId, RoomPlayer, ActionType,
  ClientMessage, ServerMessage, PlayerConnection,
} from './types';

interface WorkerRuntimeWebSocket extends WebSocket {
  accept(): void;
}

declare class WebSocketPair {
  0: WorkerRuntimeWebSocket;
  1: WorkerRuntimeWebSocket;
}

type WorkerResponseInit = ResponseInit & { webSocket?: WorkerRuntimeWebSocket };

export class GameRoom {
  private players: Map<PlayerId, PlayerConnection> = new Map();
  private engineState: EngineState | null = null;
  private isGameStarted = false;
  private messageQueue: Map<PlayerId, ServerMessage[]> = new Map();
  private static readonly WS_OPEN = 1;

  constructor(private state: DurableObjectState) {
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage?.get<EngineState>('engineState');
      if (stored) {
        console.log('📦 从持久化存储恢复游戏状态');
        this.engineState = stored;
        this.isGameStarted = true;
      } else {
        console.log('🆕 新的 Durable Object 实例，无持久化状态');
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    if (this.players.size >= 2) {
      return new Response('房间已满', { status: 429 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    await this.handlePlayerConnection(server, request);

    return new Response(null, {
      status: 101,
      webSocket: client,
    } as WorkerResponseInit);
  }

  private async handlePlayerConnection(socket: WorkerRuntimeWebSocket, request: Request): Promise<void> {
    const url = new URL(request.url);
    const roomId = url.searchParams.get('roomId') || 'ROOM-001';
    const clientPlayerId = url.searchParams.get('clientPlayerId') || this.generateClientId();

    let playerId: PlayerId = 'p1';
    const existingPlayer = Array.from(this.players.entries()).find(([_, player]) => player.clientPlayerId === clientPlayerId);

    if (existingPlayer) {
      playerId = existingPlayer[0];
      console.log(`🔄 玩家 ${playerId} 重连，clientPlayerId: ${clientPlayerId}`);
    } else {
      playerId = this.players.size === 0 ? 'p1' : 'p2';
    }

    const playerConnection: PlayerConnection = {
      socket,
      playerId,
      connected: true,
      joined: existingPlayer?.[1]?.joined ?? false,
      clientPlayerId,
      name: existingPlayer?.[1]?.name || `玩家${this.players.size + 1}`,
    };

    this.players.set(playerId, playerConnection);
    console.log(`✅ 玩家 ${playerId} 连接到房间 ${roomId}`);

    this.sendToPlayer(playerId, {
      type: 'roomJoined',
      payload: {
        success: true,
        roomId,
        playerId,
        players: this.getPlayersList(),
      },
    });

    const receiveMessage = async (message: MessageEvent) => {
      try {
        if (typeof message.data === 'string') {
          await this.handleMessage(playerId, message.data, roomId);
        }
      } catch (error) {
        console.error('处理消息失败:', error);
      }
    };

    const handleClose = () => {
      console.log(`❌ 玩家 ${playerId} 断开连接`);
      this.handlePlayerDisconnect(playerId);
    };

    const handleError = (error: Event) => {
      console.error(`❌ 玩家 ${playerId} WebSocket 错误:`, error);
    };

    socket.onmessage = receiveMessage as any;
    socket.onclose = handleClose as any;
    socket.onerror = handleError as any;

    this.flushMessageQueue(playerId);
    this.startHeartbeat(playerId);

    if (this.isGameStarted && this.engineState) {
      this.sendToPlayer(playerId, {
        type: 'stateSync',
        payload: this.engineState.publicState,
      });
    }
  }

  private async handleMessage(playerId: PlayerId, data: string, roomId: string): Promise<void> {
    try {
      const message: ClientMessage = JSON.parse(data);
      console.log(`📨 收到来自 ${playerId} 的消息:`, message.type);

      switch (message.type) {
        case 'joinRoom':
          await this.handleJoinRoom(playerId, roomId, message.payload);
          break;
        case 'drawCard':
          await this.handleDrawCard(playerId);
          break;
        case 'playAction':
          await this.handlePlayAction(playerId, message.payload);
          break;
        case 'resolveAction':
          await this.handleResolveAction(playerId, message.payload);
          break;
        case 'ping':
          this.sendToPlayer(playerId, { type: 'pong' });
          break;
        case 'leaveRoom':
          this.handlePlayerDisconnect(playerId);
          break;
        default:
          console.warn(`未知消息类型: ${message.type}`);
      }
    } catch (error) {
      console.error('解析消息失败:', error);
      this.sendToPlayer(playerId, {
        type: 'error',
        payload: { message: '消息格式错误' },
      });
    }
  }

  private async handleJoinRoom(playerId: PlayerId, roomId: string, payload: any): Promise<void> {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }

    player.joined = true;
    if (payload?.name) {
      player.name = payload.name;
    }

    console.log(`玩家 ${playerId} 确认加入房间 ${roomId}`);

    this.sendToPlayer(playerId, {
      type: 'roomJoined',
      payload: {
        success: true,
        roomId,
        playerId,
        players: this.getPlayersList(),
      },
    });

    this.broadcastToOthers(playerId, {
      type: 'playerJoined',
      payload: {
        playerId,
        name: player.name,
        socketId: player.clientPlayerId,
      },
    });

    const joinedPlayers = Array.from(this.players.values()).filter((candidate) => candidate.joined);
    if (joinedPlayers.length === 2 && !this.isGameStarted) {
      await this.startGame(roomId);
    }
  }

  private async handleDrawCard(playerId: PlayerId): Promise<void> {
    if (!this.engineState) {
      this.sendError(playerId, '游戏尚未开始');
      return;
    }

    try {
      const nextState = reducer(this.engineState, { type: 'DRAW_CARD', playerId });
      this.engineState = nextState;
      this.state.storage?.put('engineState', this.engineState).catch((error) => {
        console.error('保存游戏状态失败:', error);
      });

      this.broadcast({ type: 'stateSync', payload: this.engineState.publicState });
      this.broadcast({
        type: 'phaseChanged',
        payload: {
          phase: this.engineState.publicState.phase,
          activePlayer: this.engineState.publicState.activePlayer,
        },
      });
      this.sendToPlayer(playerId, {
        type: 'actionRequired',
        payload: { type: 'secret', minCards: 1, maxCards: 4 },
      });
    } catch (error) {
      this.sendError(playerId, error instanceof Error ? error.message : '抽卡失败');
    }
  }

  private async handlePlayAction(playerId: PlayerId, payload: any): Promise<void> {
    if (!this.engineState) {
      this.sendError(playerId, '游戏尚未开始');
      return;
    }

    try {
      const actionType: ActionType = payload?.type || 'secret';
      const cardIds: string[] = payload?.cardIds || [];
      const grouping: string[][] = payload?.grouping || [];

      const nextState = reducer(this.engineState, {
        type: 'PLAY_ACTION',
        playerId,
        actionType,
        cardIds,
        grouping,
      });
      this.engineState = nextState;
      this.state.storage?.put('engineState', this.engineState).catch((error) => {
        console.error('保存游戏状态失败:', error);
      });

      this.broadcast({ type: 'stateSync', payload: this.engineState.publicState });

      if (this.engineState.publicState.pendingAction) {
        this.sendToPlayer(this.engineState.publicState.pendingAction.chooser, {
          type: 'choiceRequired',
          payload: this.engineState.publicState.pendingAction,
        });
      }

      this.broadcast({
        type: 'phaseChanged',
        payload: {
          phase: this.engineState.publicState.phase,
          activePlayer: this.engineState.publicState.activePlayer,
        },
      });

      if (this.engineState.publicState.phase === 'game_over') {
        this.broadcast({
          type: 'gameOver',
          payload: {
            winner: this.engineState.publicState.winner,
            isDraw: this.engineState.publicState.isDraw,
            reason: this.engineState.publicState.reason || '游戏结束',
            finalScores: {
              p1: {
                geishaCount: this.engineState.publicState.players.p1.geishaCount,
                totalCharm: this.engineState.publicState.players.p1.totalCharm,
              },
              p2: {
                geishaCount: this.engineState.publicState.players.p2.geishaCount,
                totalCharm: this.engineState.publicState.players.p2.totalCharm,
              },
            },
          },
        });
      }
    } catch (error) {
      this.sendError(playerId, error instanceof Error ? error.message : '行动执行失败');
    }
  }

  private async handleResolveAction(playerId: PlayerId, payload: any): Promise<void> {
    if (!this.engineState) {
      this.sendError(playerId, '游戏尚未开始');
      return;
    }

    try {
      const selection: number = payload?.selection ?? payload ?? 0;
      const nextState = reducer(this.engineState, {
        type: 'RESOLVE_ACTION',
        playerId,
        selection,
      });
      this.engineState = nextState;
      this.state.storage?.put('engineState', this.engineState).catch((error) => {
        console.error('保存游戏状态失败:', error);
      });

      this.broadcast({ type: 'stateSync', payload: this.engineState.publicState });
      this.broadcast({
        type: 'phaseChanged',
        payload: {
          phase: this.engineState.publicState.phase,
          activePlayer: this.engineState.publicState.activePlayer,
        },
      });

      if (this.engineState.publicState.phase === 'game_over') {
        this.broadcast({
          type: 'gameOver',
          payload: {
            winner: this.engineState.publicState.winner,
            isDraw: this.engineState.publicState.isDraw,
            reason: this.engineState.publicState.reason || '游戏结束',
            finalScores: {
              p1: {
                geishaCount: this.engineState.publicState.players.p1.geishaCount,
                totalCharm: this.engineState.publicState.players.p1.totalCharm,
              },
              p2: {
                geishaCount: this.engineState.publicState.players.p2.geishaCount,
                totalCharm: this.engineState.publicState.players.p2.totalCharm,
              },
            },
          },
        });
      }
    } catch (error) {
      this.sendError(playerId, error instanceof Error ? error.message : '行动解析失败');
    }
  }

  private async startGame(roomId: string): Promise<void> {
    const players = this.getPlayersList();
    const p1Room = players.find((player) => player.playerId === 'p1');
    const p2Room = players.find((player) => player.playerId === 'p2');

    if (!p1Room || !p2Room) {
      throw new Error('房间玩家信息不完整');
    }

    this.engineState = createGameSetup(roomId, { p1: p1Room, p2: p2Room }, 'p1', Date.now());
    this.isGameStarted = true;
    await this.state.storage?.put('engineState', this.engineState);

    this.sendToPlayer('p1', {
      type: 'gameStarted',
      payload: {
        state: this.engineState.publicState,
        playerId: 'p1',
      },
    });
    this.sendToPlayer('p2', {
      type: 'gameStarted',
      payload: {
        state: this.engineState.publicState,
        playerId: 'p2',
      },
    });

    this.broadcast({
      type: 'stateSync',
      payload: this.engineState.publicState,
    });
    this.broadcast({
      type: 'phaseChanged',
      payload: {
        phase: this.engineState.publicState.phase,
        activePlayer: this.engineState.publicState.activePlayer,
      },
    });
    this.sendToPlayer('p1', {
      type: 'actionRequired',
      payload: { type: 'secret', minCards: 1, maxCards: 4 },
    });
  }

  private handlePlayerDisconnect(playerId: PlayerId): void {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }

    player.connected = false;
    player.joined = false;

    this.broadcastToOthers(playerId, {
      type: 'playerLeft',
      payload: { playerId },
    });

    console.log(`👋 玩家 ${playerId} 离开房间`);

    setTimeout(() => {
      if (this.players.get(playerId)?.connected === false) {
        this.players.delete(playerId);
        this.messageQueue.delete(playerId);
        console.log(`🗑️ 清理玩家 ${playerId} 连接`);
      }
    }, 30000);

    if (this.isGameStarted) {
      this.isGameStarted = false;
      this.engineState = null;
      this.state.storage?.delete('engineState');
    }
  }

  private generateClientId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private getPlayersList(): RoomPlayer[] {
    return Array.from(this.players.values()).map((player) => ({
      playerId: player.playerId,
      name: player.name,
      socketId: player.clientPlayerId,
    }));
  }

  private sendToPlayer(playerId: PlayerId, message: ServerMessage): void {
    const player = this.players.get(playerId);
    if (!player || !player.connected) {
      this.queueMessage(playerId, message);
      return;
    }

    try {
      if (player.socket.readyState === GameRoom.WS_OPEN) {
        player.socket.send(JSON.stringify(message));
      } else {
        this.queueMessage(playerId, message);
      }
    } catch (error) {
      console.error(`❌ 发送消息失败: ${message.type}`, error);
      this.queueMessage(playerId, message);
    }
  }

  private queueMessage(playerId: PlayerId, message: ServerMessage): void {
    if (!this.messageQueue.has(playerId)) {
      this.messageQueue.set(playerId, []);
    }
    this.messageQueue.get(playerId)!.push(message);
  }

  private flushMessageQueue(playerId: PlayerId): void {
    const queue = this.messageQueue.get(playerId);
    if (!queue || queue.length === 0) {
      return;
    }

    const player = this.players.get(playerId);
    if (!player || !player.connected || player.socket.readyState !== GameRoom.WS_OPEN) {
      return;
    }

    while (queue.length > 0) {
      const message = queue.shift();
      if (!message) {
        continue;
      }

      try {
        player.socket.send(JSON.stringify(message));
      } catch (error) {
        console.error(`❌ 刷新队列时发送消息失败: ${message.type}`, error);
        queue.unshift(message);
        break;
      }
    }
  }

  private startHeartbeat(playerId: PlayerId): void {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }

    const heartbeatInterval = setInterval(() => {
      if (player.connected && player.socket.readyState === GameRoom.WS_OPEN) {
        try {
          player.socket.send(JSON.stringify({ type: 'ping' }));
        } catch (error) {
          console.error('❌ 发送心跳失败:', error);
          clearInterval(heartbeatInterval);
        }
      } else {
        clearInterval(heartbeatInterval);
      }
    }, 30000);
  }

  private broadcast(message: ServerMessage): void {
    for (const playerId of this.players.keys()) {
      this.sendToPlayer(playerId, message);
    }
  }

  private broadcastToOthers(excludePlayerId: PlayerId, message: ServerMessage): void {
    for (const playerId of this.players.keys()) {
      if (playerId !== excludePlayerId) {
        this.sendToPlayer(playerId, message);
      }
    }
  }

  private sendError(playerId: PlayerId, message: string): void {
    this.sendToPlayer(playerId, {
      type: 'error',
      payload: { message },
    });
  }
}
