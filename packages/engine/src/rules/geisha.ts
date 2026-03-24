/**
 * Engine rules - Geisha
 * Pure geisha definitions and helpers.
 */
import { GeishaCharm, GeishaName, GeishaValue, VictoryConditions } from '@hanamikoji/shared';

export interface GeishaDefinition {
  charm: GeishaCharm;
  name: GeishaName;
  color: string;
  value: GeishaValue;
}

/**
 * 艺伎卡数据配置
 * 每位艺伎有独特的魅力值、名称和代表色
 */
export const GEISHA_CARDS: Record<GeishaCharm, GeishaDefinition> = {
  2: { charm: 2, name: '樱', color: '#FFB6C1', value: 2 },
  3: { charm: 3, name: '梅', color: '#DDA0DD', value: 2 },
  4: { charm: 4, name: '兰', color: '#87CEEB', value: 2 },
  5: { charm: 5, name: '竹', color: '#90EE90', value: 3 },
  6: { charm: 6, name: '菊', color: '#FFA500', value: 3 },
  7: { charm: 7, name: '玫瑰', color: '#FF6347', value: 4 },
  8: { charm: 8, name: '百合', color: '#FFD700', value: 5 },
};

export const GEISHA_CHARM_LIST: GeishaCharm[] = [2, 3, 4, 5, 6, 7, 8];

export const VICTORY_CONDITIONS: VictoryConditions = {
  geishaCount: 4,
  charmPoints: 11,
};

export function getGeishaCardByCharm(charm: GeishaCharm): GeishaDefinition | undefined {
  return GEISHA_CARDS[charm];
}
