/**
 * 花见小路 - 前后端共享类型定义
 * 本文件定义了游戏中所有的核心数据类型，确保前后端类型一致性
 */

// ============================================
// 基础类型定义
// ============================================

/**
 * 玩家标识符
 */
export type PlayerId = 'p1' | 'p2';

/**
 * 游戏结果类型
 */
export type GameResult = 'win' | 'lose' | 'draw';

/**
 * 艺伎魅力值类型（同时也是艺伎的ID标识）
 * 魅力值范围：2-8分
 */
export type GeishaCharm = 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * 艺伎分值类型（独立于 charm，用于计分）
 * 目前配置：2,2,2,3,3,4,5
 */
export type GeishaValue = 2 | 3 | 4 | 5;

/**
 * 艺伎名称类型
 */
export type GeishaName = '樱' | '梅' | '兰' | '竹' | '菊' | '玫瑰' | '百合';

/**
 * 行动类型枚举
 */
export type ActionType = 'secret' | 'discard' | 'gift' | 'competition';

/**
 * 游戏阶段类型
 */
export type GamePhase =
  | 'lobby'
  | 'p1_draw'
  | 'p1_action'
  | 'p2_draw'
  | 'p2_action'
  | 'p1_select'
  | 'p2_select'
  | 'scoring'
  | 'game_over';

// ============================================
// 卡牌相关类型
// ============================================

export interface ItemCard {
  id: string;
  geishaCharm: GeishaCharm;
  geishaName: GeishaName;
  displayValue: string;
  color: string;
}

/**
 * 艺伎状态（保留现有 UI 所需字段，同时将玩家牌堆收拢到 items）
 */
export interface GeishaItemsState {
  p1: string[];
  p2: string[];
}

export interface GeishaState {
  /** 魅力值，同时也是艺伎ID */
  id: GeishaCharm;
  /** 艺伎分值 */
  value: GeishaValue;
  /** 兼容旧代码 */
  charm: GeishaCharm;
  name: GeishaName;
  color: string;
  owner: PlayerId | null;
  items: GeishaItemsState;
}

/** 兼容旧命名 */
export type GeishaCard = GeishaState;

// ============================================
// 玩家状态类型
// ============================================

/**
 * 玩家行动使用状态
 * false = 未使用；true = 已使用
 */
export interface PlayerActions {
  secret: boolean;
  discard: boolean;
  gift: boolean;
  competition: boolean;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  hand: string[];
  /** false = 未使用；true = 已使用 */
  actionsUsed: PlayerActions;
  secretCard?: string | null;
  geishaCount: number;
  totalCharm: number;
  connected: boolean;
  socketId?: string;
}

export interface PlayerStateMap {
  p1: PlayerState;
  p2: PlayerState;
}

// ============================================
// 游戏状态类型
// ============================================

export interface GiftPending {
  type: 'gift';
  initiator: PlayerId;
  chooser: PlayerId;
  cards: string[];
  cardDetails: ItemCard[];
}

export interface CompetitionPending {
  type: 'competition';
  initiator: PlayerId;
  chooser: PlayerId;
  cards: string[][];
  cardDetails: ItemCard[];
}

export type PendingAction = GiftPending | CompetitionPending;

export interface GameState {
  roomId: string;
  round: number;
  phase: GamePhase;
  activePlayer: PlayerId;
  deckCount: number;
  geishas: Record<GeishaCharm, GeishaState>;
  players: PlayerStateMap;
  pendingAction: PendingAction | null;
  /** 弃牌堆（公开信息） */
  discardPile: string[];
  winner: PlayerId | null;
  isDraw: boolean;
  reason: string | null;
}

// ============================================
// 房间状态类型
// ============================================

export interface RoomPlayer {
  socketId: string;
  playerId: PlayerId;
  name: string;
}

export interface RoomState {
  roomId: string;
  players: RoomPlayer[];
  gameState: GameState | null;
  createdAt: Date;
}

// ============================================
// Socket 事件类型
// ============================================

export interface ServerToClientEvents {
  playerJoined: (player: RoomPlayer) => void;
  playerLeft: (playerId: PlayerId) => void;
  gameStarted: (state: GameState, playerId: PlayerId) => void;
  gameStateUpdate: (state: GameState) => void;
  phaseChanged: (phase: GamePhase, activePlayer: PlayerId) => void;
  actionRequired: (type: ActionType, minCards: number, maxCards: number) => void;
  choiceRequired: (action: PendingAction) => void;
  error: (message: string) => void;
  gameOver: (result: {
    winner: PlayerId | null;
    isDraw: boolean;
    reason: string;
    finalScores: {
      p1: { geishaCount: number; totalCharm: number };
      p2: { geishaCount: number; totalCharm: number };
    };
  }) => void;
  opponentDisconnected: () => void;
  opponentReconnected: () => void;
}

export interface ClientToServerEvents {
  joinRoom: (roomId: string | null, playerName: string, callback: (response: JoinRoomResponse) => void) => void;
  leaveRoom: () => void;
  startGame: () => void;
  drawCard: () => void;
  playAction: (data: {
    type: ActionType;
    cardIds: string[];
    grouping?: string[][];
  }) => void;
  resolveAction: (selection: number) => void;
  cancelAction: () => void;
  reconnect: (roomId: string, playerId: PlayerId) => void;
}

export interface JoinRoomResponse {
  success: boolean;
  roomId?: string;
  message?: string;
}

export interface ErrorResponse {
  code: string;
  message: string;
}

// ============================================
// 游戏配置类型
// ============================================

export interface ActionConfig {
  name: string;
  description: string;
  cardCount: number;
  color: string;
}

export interface VictoryConditions {
  geishaCount: number;
  charmPoints: number;
}
