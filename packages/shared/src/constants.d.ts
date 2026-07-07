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
export declare const MAX_ROUNDS = 3;
export declare const INITIAL_HAND_SIZE = 6;
export declare const GAME_CONSTANTS: {
    /** 最大局数 */
    MAX_ROUNDS: number;
    /** 每局回合数 */
    ROUNDS_PER_GAME: number;
    /** 每局行动数（每人） */
    ACTIONS_PER_PLAYER: number;
    /** 初始手牌数 */
    INITIAL_HAND_SIZE: number;
    /** 抽牌后手牌上限 */
    MAX_HAND_SIZE: number;
    /** 需要移除的暗牌数量 */
    HIDDEN_CARDS_COUNT: number;
};
//# sourceMappingURL=constants.d.ts.map