// 花见小路 - Durable Object 服务器类型定义

// 基础类型定义
export type PlayerId = 'p1' | 'p2';

export type ActionType = 'secret' | 'discard' | 'gift' | 'competition';

export type GamePhase = 
  | 'lobby'
  | 'p1_draw'
  | 'p1_action'
  | 'p2_draw'
  | 'p2_action'
  | 'p1_select'
  | 'p2_select';

// 玩家信息
export interface RoomPlayer {
  playerId: PlayerId;
  name: string;
  socketId: string;
}

// 游戏状态（简化版，与前端兼容）
export interface GameState {
  roomId: string;
  players: {
    p1: RoomPlayer;
    p2: RoomPlayer;
  };
  phase: GamePhase;
  activePlayer: PlayerId;
  pendingAction?: PendingAction;
  winner?: PlayerId | null;
  isDraw?: boolean;
  reason?: string;
  finalScores?: Record<PlayerId, number>;
}

// 待处理行动
export interface PendingAction {
  type: ActionType;
  targetPlayer: PlayerId;
  message: string;
  cardIds?: string[];
  grouping?: string[][];
}

// WebSocket 消息类型定义
export interface ClientMessage {
  type: 'joinRoom' | 'drawCard' | 'playAction' | 'resolveAction' | 'ping' | 'leaveRoom';
  payload?: any;
}

export interface ServerMessage {
  type: 'roomJoined' | 'playerJoined' | 'playerLeft' | 'gameStarted' | 'stateSync' | 
        'phaseChanged' | 'choiceRequired' | 'actionRequired' | 'gameOver' | 'error' | 'pong';
  payload?: any;
}

// 玩家连接信息
export interface PlayerConnection {
  socket: WebSocket;
  playerId: PlayerId;
  connected: boolean;
  clientPlayerId: string;
  name: string;
}

// 房间状态
export interface RoomState {
  players: Map<PlayerId, PlayerConnection>;
  gameState: GameState | null;
  isGameStarted: boolean;
}

// Durable Object 环境变量
export interface Env {
  GAME_ROOM: DurableObjectNamespace;
}

// WebSocket 事件处理器
export type MessageHandler = (playerId: PlayerId, message: ClientMessage) => void;