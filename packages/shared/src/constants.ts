/**
 * 花见小路 - 游戏常量定义（非卡牌/艺伎规则）
 * 本文件仅保留与回合/手牌数量等“状态机维度”的常量。
 *
 * 卡牌规则与艺伎规则已迁移至：
 * - packages/engine/src/rules/cards.ts
 * - packages/engine/src/rules/geisha.ts
 */

/**
 * 游戏规则常量
 */
export const MAX_ROUNDS = 3;
export const INITIAL_HAND_SIZE = 6;

export const GAME_CONSTANTS = {
  /** 最大局数 */
  MAX_ROUNDS,

  /** 每局回合数 */
  ROUNDS_PER_GAME: 8,

  /** 每局行动数（每人） */
  ACTIONS_PER_PLAYER: 4,

  /** 初始手牌数 */
  INITIAL_HAND_SIZE,

  /** 抽牌后手牌上限 */
  MAX_HAND_SIZE: 7,

  /** 需要移除的暗牌数量 */
  HIDDEN_CARDS_COUNT: 1,
};
