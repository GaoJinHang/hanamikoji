/**
 * Engine rules - Cards
 * Pure card definitions and helpers.
 */
import { ActionConfig, ActionType, GeishaCharm, ItemCard } from '@hanamikoji/shared';

/**
 * 物品卡数据配置
 * 共有二十一张物品卡，属于七位艺伎
 */
export const ITEM_CARDS: ItemCard[] = [
  // 樱（2点，2张）
  { id: 'sakura_1', geishaCharm: 2, geishaName: '樱', displayValue: '扇子', color: '#FFB6C1' },
  { id: 'sakura_2', geishaCharm: 2, geishaName: '樱', displayValue: '扇子', color: '#FFB6C1' },
  
  // 梅（3点，2张）
  { id: 'ume_1', geishaCharm: 3, geishaName: '梅', displayValue: '发簪', color: '#DDA0DD' },
  { id: 'ume_2', geishaCharm: 3, geishaName: '梅', displayValue: '发簪', color: '#DDA0DD' },
  
  // 兰（4点，2张）
  { id: 'ran_1', geishaCharm: 4, geishaName: '兰', displayValue: '和服', color: '#87CEEB' },
  { id: 'ran_2', geishaCharm: 4, geishaName: '兰', displayValue: '和服', color: '#87CEEB' },
  
  // 竹（5点，3张）
  { id: 'take_1', geishaCharm: 5, geishaName: '竹', displayValue: '茶具', color: '#90EE90' },
  { id: 'take_2', geishaCharm: 5, geishaName: '竹', displayValue: '茶具', color: '#90EE90' },
  { id: 'take_3', geishaCharm: 5, geishaName: '竹', displayValue: '茶具', color: '#90EE90' },
  
  // 菊（6点，3张）
  { id: 'kiku_1', geishaCharm: 6, geishaName: '菊', displayValue: '乐器', color: '#FFA500' },
  { id: 'kiku_2', geishaCharm: 6, geishaName: '菊', displayValue: '乐器', color: '#FFA500' },
  { id: 'kiku_3', geishaCharm: 6, geishaName: '菊', displayValue: '乐器', color: '#FFA500' },
  
  // 玫瑰（7点，4张）
  { id: 'bara_1', geishaCharm: 7, geishaName: '玫瑰', displayValue: '花朵', color: '#FF6347' },
  { id: 'bara_2', geishaCharm: 7, geishaName: '玫瑰', displayValue: '花朵', color: '#FF6347' },
  { id: 'bara_3', geishaCharm: 7, geishaName: '玫瑰', displayValue: '花朵', color: '#FF6347' },
  { id: 'bara_4', geishaCharm: 7, geishaName: '玫瑰', displayValue: '花朵', color: '#FF6347' },
  
  // 百合（8点，5张）
  { id: 'yuri_1', geishaCharm: 8, geishaName: '百合', displayValue: '香料', color: '#FFD700' },
  { id: 'yuri_2', geishaCharm: 8, geishaName: '百合', displayValue: '香料', color: '#FFD700' },
  { id: 'yuri_3', geishaCharm: 8, geishaName: '百合', displayValue: '香料', color: '#FFD700' },
  { id: 'yuri_4', geishaCharm: 8, geishaName: '百合', displayValue: '香料', color: '#FFD700' },
  { id: 'yuri_5', geishaCharm: 8, geishaName: '百合', displayValue: '香料', color: '#FFD700' },
];

/**
 * 行动配置
 * 定义四种行动的参数和行为
 */
export const ACTION_CONFIG: Record<ActionType, ActionConfig> = {
  secret: {
    name: '密约',
    description: '隐藏1张牌，局末计分',
    cardCount: 1,
    color: '#3B82F6',
  },
  discard: {
    name: '取舍',
    description: '丢弃2张牌，不计入得分',
    cardCount: 2,
    color: '#6B7280',
  },
  gift: {
    name: '赠予',
    description: '选3张，对手选1张',
    cardCount: 3,
    color: '#10B981',
  },
  competition: {
    name: '竞争',
    description: '选4张分2组，对手选1组',
    cardCount: 4,
    color: '#EF4444',
  },
};

/**
 * 卡牌前缀到魅力值的映射
 * 用于从卡牌ID中提取对应的魅力值
 */
export const CARD_PREFIX_CHARM_MAP: Record<string, GeishaCharm> = {
  'sakura': 2,
  'ume': 3,
  'ran': 4,
  'take': 5,
  'kiku': 6,
  'bara': 7,
  'yuri': 8,
};

/**
 * 根据卡牌ID获取魅力值
 * @param cardId 卡牌ID
 * @returns 魅力值，如果未找到返回null
 */
export function getCharmFromCardId(cardId: string): GeishaCharm | null {
  for (const [prefix, charm] of Object.entries(CARD_PREFIX_CHARM_MAP)) {
    if (cardId.startsWith(prefix)) {
      return charm as GeishaCharm;
    }
  }
  return null;
}

/**
 * 根据卡牌ID获取物品卡详情
 * @param cardId 卡牌ID
 * @returns 物品卡详情，如果未找到返回undefined
 */
export function getItemCardById(cardId: string): ItemCard | undefined {
  return ITEM_CARDS.find(card => card.id === cardId);
}

/**
 * 从卡牌ID数组获取卡牌详情（纯函数）
 */
export function getCardDetails(cardIds: string[]): ItemCard[] {
  const map = new Map(ITEM_CARDS.map(c => [c.id, c]));
  return cardIds.map(id => map.get(id)).filter(Boolean) as ItemCard[];
}

/**
 * 获取某行动所需选牌数量（纯函数）
 */
export function getRequiredCardCount(actionType: ActionType): number {
  return ACTION_CONFIG[actionType].cardCount;
}
