import type { ActionType, GameState, PlayerId } from '@hanamikoji/shared';
import { getRequiredCardCount } from '../rules/cards';
import { getPlayer } from './playerUtils';

function assertUniqueCardIds(cardIds: readonly string[], label = '卡牌'): void {
  const unique = new Set(cardIds);
  if (unique.size !== cardIds.length) {
    const message = label === '卡牌' ? '卡牌不能重复' : `${label}不能包含重复卡牌`;
    throw new Error(message);
  }
}

function assertSameCardSet(left: readonly string[], right: readonly string[], message: string): void {
  if (left.length !== right.length) throw new Error(message);
  const rightSet = new Set(right);
  if (left.some(cardId => !rightSet.has(cardId))) throw new Error(message);
}

export function validateSelectedCards(
  state: GameState,
  playerId: PlayerId,
  actionType: ActionType,
  cardIds: readonly string[]
): void {
  const player = getPlayer(state, playerId);
  const requiredCount = getRequiredCardCount(actionType);

  if (cardIds.length !== requiredCount) throw new Error(`${actionType}行动需要${requiredCount}张卡牌`);
  assertUniqueCardIds(cardIds);

  for (const cardId of cardIds) {
    if (!player.hand.includes(cardId)) throw new Error(`卡牌 ${cardId} 不在手中`);
  }
}

export function validateCompetitionGrouping(cardIds: readonly string[], grouping: readonly string[][] | undefined): string[][] {
  if (!grouping) throw new Error('竞争行动需要提供分组');
  if (grouping.length !== 2) throw new Error('竞争行动需要分成2组');
  for (const group of grouping) {
    if (group.length !== 2) throw new Error('竞争每组需要2张卡牌');
  }

  const flat = grouping.flat();
  assertUniqueCardIds(flat, '竞争分组');
  assertSameCardSet(flat, cardIds, '竞争分组必须且只能包含本次选择的4张卡牌');

  return grouping.map(group => [...group]);
}
