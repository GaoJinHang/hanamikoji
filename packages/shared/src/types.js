/**
 * 花见小路 - 前后端共享类型定义
 * 本文件定义了游戏中所有的核心数据类型，确保前后端类型一致性
 */
// 类型守卫函数，用于安全的类型缩小
/** 检查是否为赠予行动 */
export function isGiftAction(action) {
    return action.type === 'gift';
}
/** 检查是否为竞争行动 */
export function isCompetitionAction(action) {
    return action.type === 'competition';
}
// 类型安全的访问器函数
/** 安全获取赠予行动的卡牌列表 */
export function getGiftCards(action) {
    return isGiftAction(action) ? action.cards : null;
}
/** 安全获取竞争行动的卡牌分组 */
export function getCompetitionCards(action) {
    return isCompetitionAction(action) ? action.cards : null;
}
//# sourceMappingURL=types.js.map