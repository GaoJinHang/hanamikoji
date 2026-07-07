import { GAME_CONSTANTS, ITEM_CARDS } from '@hanamikoji/shared';
import type { EngineState } from './types';

export const EXPECTED_ACTIVE_CARD_COUNT = ITEM_CARDS.length - GAME_CONSTANTS.HIDDEN_CARDS_COUNT;
export const EXPECTED_VISIBLE_CARD_COUNT = EXPECTED_ACTIVE_CARD_COUNT;

export interface CardCountDetails {
  total: number;
  expected: number;
  duplicates: string[];
  details: Record<string, string[]>;
}

export function countCardsDetailed(state: EngineState): CardCountDetails {
  const details: Record<string, string[]> = {
    deck: [...state.deck],
    discardPile: [...state.gameState.discardPile],
    p1_hand: [...state.gameState.players.p1.hand],
    p1_secretCard: state.gameState.players.p1.secretCard ? [state.gameState.players.p1.secretCard] : [],
    p2_hand: [...state.gameState.players.p2.hand],
    p2_secretCard: state.gameState.players.p2.secretCard ? [state.gameState.players.p2.secretCard] : [],
    geishas: [],
    pendingAction: [],
  };

  for (const geisha of Object.values(state.gameState.geishas)) {
    details.geishas.push(...geisha.items.p1, ...geisha.items.p2);
  }

  const pending = state.gameState.pendingAction;
  if (pending?.type === 'gift') {
    details.pendingAction = [...pending.cards];
  } else if (pending?.type === 'competition') {
    details.pendingAction = pending.cards.flat();
  }

  const allCards = Object.values(details).flat();
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const cardId of allCards) {
    if (seen.has(cardId)) duplicates.push(cardId);
    seen.add(cardId);
  }

  return {
    total: allCards.length,
    expected: EXPECTED_ACTIVE_CARD_COUNT,
    duplicates,
    details,
  };
}

export function countCards(state: EngineState): number {
  return countCardsDetailed(state).total;
}

export function assertCardAccounting(state: EngineState): void {
  const details = countCardsDetailed(state);
  if (details.total !== details.expected || details.duplicates.length > 0) {
    throw new Error(`Card accounting broken: ${JSON.stringify(details)}`);
  }
}

export const assertCardInvariants = assertCardAccounting;
