import type { GameState, GeishaCharm, PendingAction, PlayerId } from '@hanamikoji/shared';
import { getCharmFromCardId } from '../rules/cards';
import { setPlayerState } from './playerUtils';

function getGeishaPlayerItems(geisha: GameState['geishas'][GeishaCharm], playerId: PlayerId): string[] {
  return geisha.items[playerId];
}

function updateGeishaPile(
  geishas: GameState['geishas'],
  charm: GeishaCharm,
  playerId: PlayerId,
  cardId: string
): GameState['geishas'] {
  const geisha = geishas[charm];
  return {
    ...geishas,
    [charm]: {
      ...geisha,
      items: {
        ...geisha.items,
        [playerId]: [...getGeishaPlayerItems(geisha, playerId), cardId],
      },
    },
  };
}

function placeCardsOnGeishas(
  geishas: GameState['geishas'],
  playerId: PlayerId,
  cardIds: readonly string[]
): GameState['geishas'] {
  return cardIds.reduce((acc, cardId) => {
    const charm = getCharmFromCardId(cardId);
    return charm ? updateGeishaPile(acc, charm, playerId, cardId) : acc;
  }, geishas);
}

/**
 * Effects assume reducePlayAction has already marked the action as used and removed
 * submitted cards from the initiator hand. That keeps card ownership transfer in one place.
 */
export function applySecret(state: GameState, playerId: PlayerId, cardId: string): GameState {
  return setPlayerState(state, playerId, player => ({
    ...player,
    secretCard: cardId,
  }));
}

export function applyDiscard(state: GameState, _playerId: PlayerId, discarded: readonly string[]): GameState {
  if (discarded.length === 0) return state;

  return {
    ...state,
    discardPile: [...state.discardPile, ...discarded],
  };
}

export function applyGift(state: GameState, pending: Extract<PendingAction, { type: 'gift' }>, selection: number): GameState {
  const { initiator, chooser, cards } = pending;
  if (cards.length !== 3) throw new Error('赠予行动需要3张卡牌');
  if (!Number.isInteger(selection) || selection < 0 || selection >= cards.length) throw new Error('选择索引无效');

  const chosen = cards[selection]!;
  const remaining = cards.filter((_, index) => index !== selection);
  const nextGeishas = placeCardsOnGeishas(
    placeCardsOnGeishas(state.geishas, chooser, [chosen]),
    initiator,
    remaining
  );

  return {
    ...state,
    pendingAction: null,
    geishas: nextGeishas,
  };
}

export function applyCompetition(
  state: GameState,
  pending: Extract<PendingAction, { type: 'competition' }>,
  selection: number
): GameState {
  const { initiator, chooser, cards } = pending;
  if (cards.length !== 2) throw new Error('竞争行动需要分成2组');
  for (const group of cards) {
    if (group.length !== 2) throw new Error('竞争每组需要2张卡牌');
  }
  if (!Number.isInteger(selection) || selection < 0 || selection >= cards.length) throw new Error('选择索引无效');

  const chosenGroup = cards[selection]!;
  const remainingGroup = cards[selection === 0 ? 1 : 0] ?? [];
  const nextGeishas = placeCardsOnGeishas(
    placeCardsOnGeishas(state.geishas, chooser, chosenGroup),
    initiator,
    remainingGroup
  );

  return {
    ...state,
    pendingAction: null,
    geishas: nextGeishas,
  };
}
