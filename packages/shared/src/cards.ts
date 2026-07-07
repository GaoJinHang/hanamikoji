/**
 * Shared card/action metadata.
 *
 * This module is intentionally UI-safe and runtime-safe: it contains static
 * domain data plus tiny lookup helpers, but no reducer/game-room/socket logic.
 * Client can render cards/actions from here without depending on the engine.
 */
import type { ActionConfig, ActionType, GeishaCharm, ItemCard } from './types';

/**
 * 21 item cards used by each round.
 */
export const ITEM_CARDS: readonly ItemCard[] = [
  { id: 'sakura_1', geishaCharm: 2, geishaName: '樱', displayValue: '扇子', color: '#FFB6C1' },
  { id: 'sakura_2', geishaCharm: 2, geishaName: '樱', displayValue: '扇子', color: '#FFB6C1' },

  { id: 'ume_1', geishaCharm: 3, geishaName: '梅', displayValue: '发簪', color: '#DDA0DD' },
  { id: 'ume_2', geishaCharm: 3, geishaName: '梅', displayValue: '发簪', color: '#DDA0DD' },

  { id: 'ran_1', geishaCharm: 4, geishaName: '兰', displayValue: '和服', color: '#87CEEB' },
  { id: 'ran_2', geishaCharm: 4, geishaName: '兰', displayValue: '和服', color: '#87CEEB' },

  { id: 'take_1', geishaCharm: 5, geishaName: '竹', displayValue: '茶具', color: '#90EE90' },
  { id: 'take_2', geishaCharm: 5, geishaName: '竹', displayValue: '茶具', color: '#90EE90' },
  { id: 'take_3', geishaCharm: 5, geishaName: '竹', displayValue: '茶具', color: '#90EE90' },

  { id: 'kiku_1', geishaCharm: 6, geishaName: '菊', displayValue: '乐器', color: '#FFA500' },
  { id: 'kiku_2', geishaCharm: 6, geishaName: '菊', displayValue: '乐器', color: '#FFA500' },
  { id: 'kiku_3', geishaCharm: 6, geishaName: '菊', displayValue: '乐器', color: '#FFA500' },

  { id: 'bara_1', geishaCharm: 7, geishaName: '玫瑰', displayValue: '花朵', color: '#FF6347' },
  { id: 'bara_2', geishaCharm: 7, geishaName: '玫瑰', displayValue: '花朵', color: '#FF6347' },
  { id: 'bara_3', geishaCharm: 7, geishaName: '玫瑰', displayValue: '花朵', color: '#FF6347' },
  { id: 'bara_4', geishaCharm: 7, geishaName: '玫瑰', displayValue: '花朵', color: '#FF6347' },

  { id: 'yuri_1', geishaCharm: 8, geishaName: '百合', displayValue: '香料', color: '#FFD700' },
  { id: 'yuri_2', geishaCharm: 8, geishaName: '百合', displayValue: '香料', color: '#FFD700' },
  { id: 'yuri_3', geishaCharm: 8, geishaName: '百合', displayValue: '香料', color: '#FFD700' },
  { id: 'yuri_4', geishaCharm: 8, geishaName: '百合', displayValue: '香料', color: '#FFD700' },
  { id: 'yuri_5', geishaCharm: 8, geishaName: '百合', displayValue: '香料', color: '#FFD700' },
];

export const ACTION_CONFIG: Readonly<Record<ActionType, ActionConfig>> = {
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

export const CARD_PREFIX_CHARM_MAP: Readonly<Record<string, GeishaCharm>> = {
  sakura: 2,
  ume: 3,
  ran: 4,
  take: 5,
  kiku: 6,
  bara: 7,
  yuri: 8,
};

const ITEM_CARD_BY_ID = new Map(ITEM_CARDS.map((card) => [card.id, card]));

export function getCharmFromCardId(cardId: string): GeishaCharm | null {
  for (const [prefix, charm] of Object.entries(CARD_PREFIX_CHARM_MAP)) {
    if (cardId.startsWith(prefix)) return charm;
  }
  return null;
}

export function getItemCardById(cardId: string): ItemCard | undefined {
  return ITEM_CARD_BY_ID.get(cardId);
}

export function getCardDetails(cardIds: readonly string[]): ItemCard[] {
  return cardIds
    .map((id) => ITEM_CARD_BY_ID.get(id))
    .filter((card): card is ItemCard => card !== undefined);
}

export function getRequiredCardCount(actionType: ActionType): number {
  return ACTION_CONFIG[actionType].cardCount;
}
