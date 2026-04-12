/**
 * 花见小路 - Durable Object 游戏房间实现
 * 每个房间对应一个 DO 实例，维护两个玩家的连接和游戏状态
 */

import { createGameSetup, reducer, type EngineState } from '../../../packages/engine/src/index';
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

export class GameRoom extends DurableObject {
  private players: Map<PlayerId, PlayerConnection> = new Map();
  private engineState: EngineState | null = null;
  private isGameStarted = false;
  private messageQueue: Map<PlayerId, ServerMessage[]> = new Map();
  private static readonly WS_OPEN = 1;

  constructor(private readonly state: DurableObjectState, private readonly env: unknown) {
    super(state, env);

    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage?.get<EngineState>('engineState');
      if (stored) {
        this.engineState = stored;
        this.isGameStarted = true;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const url = new URL(request.url);
    const clientPlayerId = url.searchParams.get('clientPlayerId') || '';
    const existingPlayer = clientPlayerId
      ? Array.from(this.players.entries()).find(([_, player]) => player.clientPlayerId === clientPlayerId)
      : undefined;

    if (this.players.size >= 2 && !existingPlayer) {
      return new Response('房间已满', { status: 429 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    await this.handlePlayerConnection(server, request, existingPlayer?.[0]);

    return new Response(null, {
      status: 101,
      webSocket: client,
    } as WorkerResponseInit);
  }

  private async handlePlayerConnection(
    socket: WorkerRuntimeWebSocket,
    request: Request,
    existingPlayerId?: PlayerId,
  ): Promise<void> {
    const url = new URL(request.url);
    const roomId = (url.searchParams.get('roomId') || 'ROOM-001').trim().toUpperCase();
    const clientPlayerId = url.searchParams.get('clientPlayerId') || this.generateClientId();

    let playerId: PlayerId;
    const existingPlayer = existingPlayerId ? this.players.get(existingPlayerId) : undefined;

    if (existingPlayerId && existingPlayer) {
      playerId = existingPlayerId;
    } else {
      playerId = this.players.size === 0 ? 'p1' : 'p2';
    }

    const playerConnection: PlayerConnection = {
      socket,
      playerId,
      connected: true,
      joined: existingPlayer?.joined ?? false,
      clientPlayerId,
      name: existingPlayer?.name || `玩家${playerId === 'p1' ? '1' : '2'}`,
    };

    this.players.set(playerId, playerConnection);

    this.sendToPlayer(playerId, {
      type: 'roomJoined',
      payload: {
        success: true,
        roomId,
        playerId,
        players: this.getPlayersList(),
      },
    });

    socket.onmessage = ((message: MessageEvent) => {
      if (typeof message.data === 'string') {
        void this.handleMessage(playerId, message.data, roomId);
      }
    }) as any;

    socket.onclose = (() => {
      this.handlePlayerDisconnect(playerId);
    }) as any;

    socket.onerror = ((error: Event) => {
      console.error(`玩家 ${playerId} WebSocket 错误`, error);
    }) as any;

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
          this.sendError(playerId, '不支持的消息类型');
      }
    } catch (error) {
      console.error('解析消息失败:', error);
      this.sendError(playerId, '消息格式错误');
    }
  }

  private async handleJoinRoom(playerId: PlayerId, roomId: string, payload: unknown): Promise<void> {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }

    player.joined = true;
    if (payload && typeof payload === 'object' && 'name' in payload && typeof (payload as { name?: unknown }).name === 'string') {
      player.name = ((payload as { name: string }).name || '').trim() || player.name;
    }

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
        this.broadcastGameOver();
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
        this.broadcastGameOver();
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

  private broadcastGameOver(): void {
    if (!this.engineState) {
      return;
    }

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

    setTimeout(() => {
      if (this.players.get(playerId)?.connected === false) {
        this.players.delete(playerId);
        this.messageQueue.delete(playerId);
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
      console.error(`发送消息失败: ${message.type}`, error);
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
        console.error(`刷新队列时发送消息失败: ${message.type}`, error);
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
          console.error('发送心跳失败:', error);
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
