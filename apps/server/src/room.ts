/**
 * 花见小路 - Durable Object 游戏房间实现
 * 每个房间对应一个 DO 实例，维护两个玩家的连接和游戏状态
 */

import type { 
  PlayerId, GameState, RoomPlayer, ActionType, GamePhase, PendingAction,
  ClientMessage, ServerMessage, PlayerConnection 
} from './types';

// WebSocket 扩展类型声明
interface WorkerRuntimeWebSocket extends WebSocket {
  accept(): void;
}

declare class WebSocketPair {
  0: WorkerRuntimeWebSocket;
  1: WorkerRuntimeWebSocket;
}

type WorkerResponseInit = ResponseInit & { webSocket?: WorkerRuntimeWebSocket };

export class GameRoom {
  // 房间状态
  private players: Map<PlayerId, PlayerConnection> = new Map();
  private gameState: GameState | null = null;
  private isGameStarted: boolean = false;
  private playerCount: number = 0;

  constructor(private state: DurableObjectState) {
    // 从持久化存储恢复状态（如果需要）
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage?.get<GameState>('gameState');
      if (stored) {
        this.gameState = stored;
        this.isGameStarted = true;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    // 检查是否为 WebSocket 升级请求
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    // 创建 WebSocket 对
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();

    // 处理玩家连接
    await this.handlePlayerConnection(server, request);

    return new Response(null, {
      status: 101,
      webSocket: client,
    } as WorkerResponseInit);
  }

  /**
   * 处理玩家连接
   */
  private async handlePlayerConnection(socket: WorkerRuntimeWebSocket, request: Request): Promise<void> {
    const url = new URL(request.url);
    const roomId = url.searchParams.get('roomId') || 'default';
    
    // 分配玩家ID
    const playerId: PlayerId = this.playerCount === 0 ? 'p1' : 'p2';
    this.playerCount++;

    // 生成客户端ID
    const clientPlayerId = this.generateClientId();
    
    // 创建玩家连接记录
    const playerConnection: PlayerConnection = {
      socket,
      playerId,
      connected: true,
      clientPlayerId,
      name: `玩家${this.playerCount}`
    };

    this.players.set(playerId, playerConnection);

    console.log(`✅ 玩家 ${playerId} 加入房间 ${roomId}`);

    // 发送连接成功消息
    this.sendToPlayer(playerId, {
      type: 'roomJoined',
      payload: {
        success: true,
        roomId,
        playerId,
        players: this.getPlayersList()
      }
    });

    // 通知其他玩家有新玩家加入
    this.broadcastToOthers(playerId, {
      type: 'playerJoined',
      payload: {
        playerId,
        name: playerConnection.name,
        socketId: clientPlayerId
      }
    });

    // 设置消息监听器
    socket.addEventListener("message", (event) => {
      this.handleMessage(playerId, event.data.toString());
    });

    // 设置关闭监听器
    socket.addEventListener("close", () => {
      console.log(`❌ 玩家 ${playerId} 断开连接`);
      this.handlePlayerDisconnect(playerId);
    });

    // 如果房间已满，开始游戏
    if (this.players.size === 2 && !this.isGameStarted) {
      await this.startGame(roomId);
    }

    // 如果游戏已经开始，发送当前状态给新玩家
    if (this.isGameStarted && this.gameState) {
      this.sendToPlayer(playerId, {
        type: 'stateSync',
        payload: this.gameState
      });
    }
  }

  /**
   * 处理玩家消息
   */
  private handleMessage(playerId: PlayerId, data: string): void {
    try {
      const message: ClientMessage = JSON.parse(data);
      console.log(`📨 收到来自 ${playerId} 的消息:`, message.type);

      switch (message.type) {
        case 'drawCard':
          this.handleDrawCard(playerId);
          break;
        case 'playAction':
          this.handlePlayAction(playerId, message.payload);
          break;
        case 'resolveAction':
          this.handleResolveAction(playerId, message.payload);
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
        payload: { message: '消息格式错误' }
      });
    }
  }

  /**
   * 处理抽卡动作
   */
  private handleDrawCard(playerId: PlayerId): void {
    if (!this.gameState) {
      this.sendError(playerId, '游戏尚未开始');
      return;
    }

    try {
      // 简化版抽卡逻辑 - 这里需要集成实际的游戏引擎
      console.log(`玩家 ${playerId} 抽卡`);
      
      // 更新游戏状态
      this.gameState.activePlayer = playerId === 'p1' ? 'p2' : 'p1';
      this.gameState.phase = this.gameState.activePlayer + '_draw' as GamePhase;
      
      // 广播状态更新
      this.broadcast({
        type: 'stateSync',
        payload: this.gameState
      });

      // 通知阶段变化
      this.broadcast({
        type: 'phaseChanged',
        payload: {
          phase: this.gameState.phase,
          activePlayer: this.gameState.activePlayer
        }
      });

    } catch (error) {
      this.sendError(playerId, error instanceof Error ? error.message : '抽卡失败');
    }
  }

  /**
   * 处理行动执行
   */
  private handlePlayAction(playerId: PlayerId, payload: any): void {
    if (!this.gameState) {
      this.sendError(playerId, '游戏尚未开始');
      return;
    }

    try {
      console.log(`玩家 ${playerId} 执行行动:`, payload);
      
      // 简化版行动逻辑 - 这里需要集成实际的游戏引擎
      const actionType: ActionType = payload?.type || 'secret';
      
      // 创建待处理行动
      const pendingAction: PendingAction = {
        type: actionType,
        targetPlayer: playerId === 'p1' ? 'p2' : 'p1',
        message: `请对 ${actionType} 行动做出选择`,
        cardIds: payload?.cardIds || [],
        grouping: payload?.grouping || []
      };

      this.gameState.pendingAction = pendingAction;
      
      // 广播状态更新
      this.broadcast({
        type: 'stateSync',
        payload: this.gameState
      });

      // 发送选择要求
      this.sendToPlayer(pendingAction.targetPlayer, {
        type: 'choiceRequired',
        payload: pendingAction
      });

    } catch (error) {
      this.sendError(playerId, error instanceof Error ? error.message : '行动执行失败');
    }
  }

  /**
   * 处理行动解析
   */
  private handleResolveAction(playerId: PlayerId, payload: any): void {
    if (!this.gameState) {
      this.sendError(playerId, '游戏尚未开始');
      return;
    }

    try {
      console.log(`玩家 ${playerId} 解析行动:`, payload);
      
      // 简化版行动解析逻辑 - 这里需要集成实际的游戏引擎
      
      // 清除待处理行动
      this.gameState.pendingAction = undefined;
      
      // 更新游戏状态
      this.gameState.activePlayer = playerId === 'p1' ? 'p2' : 'p1';
      this.gameState.phase = this.gameState.activePlayer + '_action' as GamePhase;
      
      // 广播状态更新
      this.broadcast({
        type: 'stateSync',
        payload: this.gameState
      });

      // 检查游戏是否结束（模拟）
      if (Math.random() > 0.9) {
        this.handleGameOver();
      }

    } catch (error) {
      this.sendError(playerId, error instanceof Error ? error.message : '行动解析失败');
    }
  }

  /**
   * 开始游戏
   */
  private async startGame(roomId: string): Promise<void> {
    console.log(`🎮 房间 ${roomId} 开始游戏`);

    const players = this.getPlayersList();
    const p1 = players.find(p => p.playerId === 'p1');
    const p2 = players.find(p => p.playerId === 'p2');

    if (!p1 || !p2) {
      throw new Error('房间玩家信息不完整');
    }

    // 创建新游戏（简化版）
    this.gameState = {
      roomId,
      players: { p1, p2 },
      phase: 'p1_draw',
      activePlayer: 'p1'
    };
    
    this.isGameStarted = true;

    // 保存游戏状态到持久化存储
    await this.state.storage?.put('gameState', this.gameState);

    // 广播游戏开始
    this.broadcast({
      type: 'gameStarted',
      payload: {
        state: this.gameState,
        playerId: 'p1'
      }
    });

    // 发送初始状态
    this.broadcast({
      type: 'stateSync',
      payload: this.gameState
    });
  }

  /**
   * 处理游戏结束
   */
  private handleGameOver(): void {
    if (!this.gameState) return;

    console.log('🏁 游戏结束');

    // 随机决定胜者
    const winner: PlayerId = Math.random() > 0.5 ? 'p1' : 'p2';
    
    this.broadcast({
      type: 'gameOver',
      payload: {
        winner,
        isDraw: false,
        reason: '游戏正常结束',
        finalScores: { p1: 10, p2: 8 }
      }
    });

    // 清理游戏状态
    this.gameState = null;
    this.isGameStarted = false;
    this.state.storage?.delete('gameState');
  }

  /**
   * 处理玩家断开连接
   */
  private handlePlayerDisconnect(playerId: PlayerId): void {
    const player = this.players.get(playerId);
    if (player) {
      player.connected = false;
      
      // 通知其他玩家
      this.broadcastToOthers(playerId, {
        type: 'playerLeft',
        payload: { playerId }
      });

      console.log(`👋 玩家 ${playerId} 离开房间`);
    }
  }

  /**
   * 工具方法
   */
  private generateClientId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private getPlayersList(): RoomPlayer[] {
    return Array.from(this.players.values()).map(p => ({
      playerId: p.playerId,
      name: p.name,
      socketId: p.clientPlayerId
    }));
  }

  private sendToPlayer(playerId: PlayerId, message: ServerMessage): void {
    const player = this.players.get(playerId);
    if (player?.connected && player.socket.readyState === WebSocket.OPEN) {
      player.socket.send(JSON.stringify(message));
    }
  }

  private broadcast(message: ServerMessage): void {
    const messageStr = JSON.stringify(message);
    for (const player of this.players.values()) {
      if (player.connected && player.socket.readyState === WebSocket.OPEN) {
        player.socket.send(messageStr);
      }
    }
  }

  private broadcastToOthers(excludePlayerId: PlayerId, message: ServerMessage): void {
    const messageStr = JSON.stringify(message);
    for (const [playerId, player] of this.players.entries()) {
      if (playerId !== excludePlayerId && player.connected && player.socket.readyState === WebSocket.OPEN) {
        player.socket.send(messageStr);
      }
    }
  }

  private sendError(playerId: PlayerId, message: string): void {
    this.sendToPlayer(playerId, {
      type: 'error',
      payload: { message }
    });
  }
}