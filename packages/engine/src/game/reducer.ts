/**
 * Engine - pure reducer (immutable updates)
 */
import { ActionType, GameState, GeishaCharm, GeishaState, PendingAction, PlayerActions, PlayerId, MAX_ROUNDS } from '@hanamikoji/shared';
import { getCharmFromCardId, getCardDetails, getRequiredCardCount } from '../rules/cards';
import { EngineAction, EngineState, PlayActionResult, RoundSetupPayload } from './types';
import { applyScoring, checkVictory } from './winCheck';
import { createRoundSetup } from '../rules/deck';

/**
 * 调试用卡牌计数函数
 * 统计游戏状态中所有卡牌的总数
 */
function countCardsDetailed(state: EngineState): { total: number; details: Record<string, string[]> } {
  const details: Record<string, string[]> = {
    deck: [],
    discardPile: [],
    p1_hand: [],
    p1_secretCard: [],
    p2_hand: [],
    p2_secretCard: [],
    geishas: [],
    pendingAction: [],
  };

  details.deck = [...state.deck];
  details.discardPile = [...(state.publicState.discardPile ?? [])];

  for (const [pid, p] of Object.entries(state.publicState.players)) {
    details[`${pid}_hand`] = [...p.hand];
    if (p.secretCard) details[`${pid}_secretCard`] = [p.secretCard];
  }

  for (const g of Object.values(state.publicState.geishas)) {
    details.geishas.push(...g.items.p1, ...g.items.p2);
  }

  if (state.publicState.pendingAction) {
    const pa = state.publicState.pendingAction;
    if (pa.type === 'gift') {
      details.pendingAction = [...pa.cards];
    } else if (pa.type === 'competition') {
      details.pendingAction = pa.cards.flat();
    }
  }

  const allCards = [
    ...details.deck,
    ...details.discardPile,
    ...details.p1_hand,
    ...details.p1_secretCard,
    ...details.p2_hand,
    ...details.p2_secretCard,
    ...details.geishas,
    ...details.pendingAction,
  ];

  return { total: allCards.length, details };
}

function countCards(state: EngineState): number {
  const { total } = countCardsDetailed(state);
  return total;
}

export { countCards };

const PLAYER_IDS: readonly PlayerId[] = ['p1', 'p2'];

function otherPlayer(playerId: PlayerId): PlayerId {
  return playerId === 'p1' ? 'p2' : 'p1';
}

function getPlayer(state: GameState, playerId: PlayerId): GameState['players'][PlayerId] {
  return state.players[playerId];
}

function getGeishaPlayerItems(geisha: GameState['geishas'][GeishaCharm], playerId: PlayerId): string[] {
  return geisha.items[playerId];
}

function countRemainingActions(actionsUsed: PlayerActions): number {
  return Object.values(actionsUsed).filter(used => !used).length;
}

function createFreshActionsUsed(): PlayerActions {
  return { secret: false, discard: false, gift: false, competition: false };
}

function shouldEndRound(state: GameState): boolean {
  return PLAYER_IDS.every(playerId => countRemainingActions(getPlayer(state, playerId).actionsUsed) === 0);
}

function phaseForDraw(playerId: PlayerId): GameState['phase'] {
  return playerId === 'p1' ? 'p1_draw' : 'p2_draw';
}

function phaseForAction(playerId: PlayerId): GameState['phase'] {
  return playerId === 'p1' ? 'p1_action' : 'p2_action';
}

function phaseForSelect(playerId: PlayerId): GameState['phase'] {
  return playerId === 'p1' ? 'p1_select' : 'p2_select';
}

function setPlayerState<T extends EngineState | GameState>(
  root: T,
  playerId: PlayerId,
  patch: (player: GameState['players'][PlayerId]) => GameState['players'][PlayerId]
): T {
  if ('publicState' in root) {
    const ps = root.publicState;
    return {
      ...root,
      publicState: {
        ...ps,
        players: {
          ...ps.players,
          [playerId]: patch(ps.players[playerId]),
        },
      },
    } as T;
  }

  return {
    ...root,
    players: {
      ...root.players,
      [playerId]: patch(root.players[playerId]),
    },
  } as T;
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

function applySecret(state: GameState, playerId: PlayerId, cardId: string): GameState {
  return setPlayerState(state, playerId, player => ({
    ...player,
    hand: player.hand.filter(id => id !== cardId),
    secretCard: cardId,
  }));
}

function applyDiscard(state: GameState, playerId: PlayerId, discarded: string[]): GameState {
  if (discarded.length === 0) return state;

  const nextDiscardPile = [...state.discardPile, ...discarded];

  return {
    ...state,
    discardPile: nextDiscardPile,
    players: {
      ...state.players,
      [playerId]: {
        ...state.players[playerId],
        hand: state.players[playerId].hand.filter(id => !discarded.includes(id)),
      },
    },
  };
}

function applyGift(state: GameState, pending: Extract<PendingAction, { type: 'gift' }>, selection: number): GameState {
  const { initiator, chooser } = pending;
  const cards: string[] = pending.cards;
  if (cards.length !== 3) throw new Error('赠予行动需要3张卡牌');
  if (selection < 0 || selection >= cards.length) throw new Error('选择索引无效');

  const chosen = cards[selection];
  const remaining = cards.filter((_: string, index: number) => index !== selection);
  
  // 从发起者手牌中删除所有赠予的卡牌
  const initiatorHand = state.players[initiator].hand.filter(id => !cards.includes(id));
  
  // 规则调整：赠予行动中，选择的牌直接进入「选择者」的艺伎计分区，
  // 剩余的牌进入发起者的艺伎计分区，不再进入手牌
  const geishasAfterChosen = [chosen].reduce((acc: GameState['geishas'], cardId: string) => {
    const charm = getCharmFromCardId(cardId);
    if (!charm) return acc;
    return updateGeishaPile(acc, charm, chooser, cardId);
  }, state.geishas);

  const nextGeishas = remaining.reduce((acc: GameState['geishas'], cardId: string) => {
    const charm = getCharmFromCardId(cardId);
    if (!charm) return acc;
    return updateGeishaPile(acc, charm, initiator, cardId);
  }, geishasAfterChosen);

  return {
    ...state,
    players: {
      ...state.players,
      [initiator]: {
        ...state.players[initiator],
        hand: initiatorHand,
      },
    },
    geishas: nextGeishas,
  };
}

function applyCompetition(state: GameState, pending: Extract<PendingAction, { type: 'competition' }>, selection: number): GameState {
  const { initiator, chooser } = pending;
  const cards: string[][] = pending.cards;
  if (cards.length !== 2) throw new Error('竞争行动需要分成2组');
  for (const group of cards) {
    if (group.length !== 2) throw new Error('竞争每组需要2张卡牌');
  }
  if (selection < 0 || selection >= cards.length) throw new Error('选择索引无效');

  const chosenGroup = cards[selection];
  const remainingGroup = cards.filter((_: string[], index: number) => index !== selection)[0] ?? [];
  
  // 从发起者手牌中删除所有竞争的卡牌
  const allCards = cards.flat();
  const initiatorHand = state.players[initiator].hand.filter(id => !allCards.includes(id));
  
  // 规则调整：选择者获得的一组牌直接进入其艺伎计分区，
  // 另一组牌进入发起者的艺伎计分区，不再进入手牌
  const geishasAfterChosen = chosenGroup.reduce((acc: GameState['geishas'], cardId: string) => {
    const charm = getCharmFromCardId(cardId);
    if (!charm) return acc;
    return updateGeishaPile(acc, charm, chooser, cardId);
  }, state.geishas);

  const nextGeishas = remainingGroup.reduce((acc: GameState['geishas'], cardId: string) => {
    const charm = getCharmFromCardId(cardId);
    if (!charm) return acc;
    return updateGeishaPile(acc, charm, initiator, cardId);
  }, geishasAfterChosen);

  return {
    ...state,
    players: {
      ...state.players,
      [initiator]: {
        ...state.players[initiator],
        hand: initiatorHand,
      },
    },
    geishas: nextGeishas,
  };
}

function resetPlayerForRound(player: GameState['players'][PlayerId], hand: string[]): GameState['players'][PlayerId] {
  return {
    ...player,
    actionsUsed: createFreshActionsUsed(),
    hand: [...hand],
    secretCard: null,
  };
}

function applyRoundSetupPayload(engineState: EngineState, payload: RoundSetupPayload & { rngState?: number }): EngineState {
  const currentRound = engineState.publicState.round;
  const nextRound = currentRound + 1;
  const firstPlayer: PlayerId = nextRound % 2 === 1 ? 'p1' : 'p2';

  // 重置艺伎区域（清空所有艺伎的物品卡）
  const resetGeishas: Record<GeishaCharm, GeishaState> = {} as Record<GeishaCharm, GeishaState>;
  for (const [charmStr, geisha] of Object.entries(engineState.publicState.geishas)) {
    const charm = Number(charmStr) as GeishaCharm;
    resetGeishas[charm] = {
      ...geisha,
      items: { p1: [], p2: [] },
      owner: null,
    };
  }

  const result = {
    ...engineState,
    deck: [...payload.deck],
    rngState: payload.rngState !== undefined ? payload.rngState : engineState.rngState,
    publicState: {
      ...engineState.publicState,
      deckCount: payload.deck.length,
      round: nextRound,
      activePlayer: firstPlayer,
      phase: phaseForDraw(firstPlayer),
      players: {
        p1: resetPlayerForRound(engineState.publicState.players.p1, payload.hands.p1),
        p2: resetPlayerForRound(engineState.publicState.players.p2, payload.hands.p2),
      },
      // 新的一局重新洗牌发牌，弃牌堆清空，艺伎区域重置
      discardPile: [],
      geishas: resetGeishas,
    },
    meta: { ...engineState.meta, needsRoundSetup: false },
  };

  return result;
}

function advanceAfterNonChoiceAction(engineState: EngineState, actedBy: PlayerId, roundSetup?: RoundSetupPayload): EngineState {
  const currentPublicState = engineState.publicState;

  if (shouldEndRound(currentPublicState)) {
    const { nextState: scored } = applyScoring(currentPublicState);
    const victory = checkVictory(scored);

    if (victory.winner) {
      return {
        ...engineState,
        publicState: {
          ...scored,
          winner: victory.winner,
          isDraw: false,
          reason: victory.reason,
          phase: 'game_over',
        },
        meta: { ...engineState.meta, needsRoundSetup: false },
      };
    }

    if (scored.round >= MAX_ROUNDS) {
      return {
        ...engineState,
        publicState: {
          ...scored,
          winner: null,
          isDraw: true,
          reason: 'MAX_ROUNDS_DRAW',
          phase: 'game_over',
        },
        meta: { ...engineState.meta, needsRoundSetup: false },
      };
    }

    if (roundSetup) {
      return applyRoundSetupPayload({ ...engineState, publicState: scored }, roundSetup as RoundSetupPayload & { rngState?: number });
    }

    const setup = createRoundSetup(engineState.rngState);
    const nextRound = scored.round + 1;
    const firstPlayer: PlayerId = nextRound % 2 === 1 ? 'p1' : 'p2';

    // 重置艺伎区域（清空所有艺伎的物品卡）
    const resetGeishas: Record<GeishaCharm, GeishaState> = {} as Record<GeishaCharm, GeishaState>;
    for (const [charmStr, geisha] of Object.entries(scored.geishas)) {
      const charm = Number(charmStr) as GeishaCharm;
      resetGeishas[charm] = {
        ...geisha,
        items: { p1: [], p2: [] },
        owner: null,
      };
    }

    return {
      ...engineState,
      deck: [...setup.deck],
      rngState: setup.rngState,
      publicState: {
        ...scored,
        deckCount: setup.deck.length,
        round: nextRound,
        activePlayer: firstPlayer,
        phase: phaseForDraw(firstPlayer),
        players: {
          p1: resetPlayerForRound(getPlayer(scored, 'p1'), setup.hands.p1),
          p2: resetPlayerForRound(getPlayer(scored, 'p2'), setup.hands.p2),
        },
        // 新的一局重新洗牌发牌，弃牌堆清空，艺伎区域重置
        discardPile: [],
        geishas: resetGeishas,
      },
      meta: { ...engineState.meta, needsRoundSetup: false },
    };
  }

  const nextPlayer = otherPlayer(actedBy);
  return {
    ...engineState,
    publicState: {
      ...currentPublicState,
      activePlayer: nextPlayer,
      phase: phaseForDraw(nextPlayer),
    },
  };
}

export function reducer(state: EngineState, action: EngineAction): EngineState {
  const beforeCount = countCards(state);
  if (beforeCount !== 20) {
    console.log('=== BEFORE ===', JSON.stringify(action.type), beforeCount);
    console.log('BEFORE DETAIL:', JSON.stringify(countCardsDetailed(state)));
  }
  const current = state;

  if (action.type === 'SET_CONNECTED') {
    return setPlayerState(current, action.playerId, player => ({
      ...player,
      connected: action.connected,
      ...(action.socketId ? { socketId: action.socketId } : {}),
    }));
  }

  if ((action as EngineAction).type === 'APPLY_ROUND_SETUP') {
    const s = current.publicState;
    if (!current.meta.needsRoundSetup) throw new Error('当前不需要进行新一局的发牌');
    if (s.phase === 'game_over') throw new Error('游戏已结束');
    return applyRoundSetupPayload(current, action as EngineAction & { type: 'APPLY_ROUND_SETUP' });
  }

  type Handler = (engine: EngineState, nextAction: EngineAction) => EngineState;

  const onDraw: Handler = (engine, nextAction) => {
    if (nextAction.type !== 'DRAW_CARD') return engine;

    const { playerId } = nextAction;
    const s = engine.publicState;

    if (s.phase === 'game_over') throw new Error('游戏已结束');
    if (s.activePlayer !== playerId) throw new Error('不是你的回合');
    if (![phaseForDraw('p1'), phaseForDraw('p2')].includes(s.phase)) throw new Error('当前不是抽牌阶段');
    if (engine.deck.length <= 0) throw new Error('牌堆已空');

    const cardId = engine.deck[engine.deck.length - 1]!;
    const nextDeck = engine.deck.slice(0, -1);
    const nextHand = [...getPlayer(s, playerId).hand, cardId];

    return {
      ...engine,
      deck: nextDeck,
      publicState: {
        ...s,
        deckCount: nextDeck.length,
        phase: phaseForAction(playerId),
        players: {
          ...s.players,
          [playerId]: {
            ...getPlayer(s, playerId),
            hand: nextHand,
          },
        },
      },
    };
  };

  const onAction: Handler = (engine, nextAction) => {
    if (nextAction.type !== 'PLAY_ACTION') return engine;

    const { playerId, actionType, cardIds, grouping } = nextAction;
    const s = engine.publicState;
    const player = getPlayer(s, playerId);

    if (s.phase === 'game_over') throw new Error('游戏已结束');
    if (s.activePlayer !== playerId) throw new Error('不是你的回合');
    if (![phaseForAction('p1'), phaseForAction('p2')].includes(s.phase)) throw new Error('当前不是行动阶段');
    if (player.actionsUsed[actionType]) throw new Error(`${actionType}行动已使用`);

    const requiredCount = getRequiredCardCount(actionType);
    if (cardIds.length !== requiredCount) throw new Error(`${actionType}行动需要${requiredCount}张卡牌`);
    for (const cardId of cardIds) {
      if (!player.hand.includes(cardId)) throw new Error(`卡牌 ${cardId} 不在手中`);
    }

    const nextActionsUsed: PlayerActions = { ...player.actionsUsed, [actionType]: true };
    const nextHand = player.hand.filter((cardId: string) => !cardIds.includes(cardId));

    const base: EngineState = {
      ...engine,
      publicState: {
        ...s,
        players: {
          ...s.players,
          [playerId]: {
            ...player,
            actionsUsed: nextActionsUsed,
            hand: nextHand,
          },
        },
      },
    };

    if (actionType === 'secret') {
      const nextPublic = applySecret(base.publicState, playerId, cardIds[0]);
      return advanceAfterNonChoiceAction({ ...base, publicState: nextPublic }, playerId, nextAction.roundSetup);
    }

    if (actionType === 'discard') {
      const nextPublic = applyDiscard(base.publicState, playerId, cardIds);
      return advanceAfterNonChoiceAction({ ...base, publicState: nextPublic }, playerId, nextAction.roundSetup);
    }

    const chooser = otherPlayer(playerId);
    const pendingAction: PendingAction =
      actionType === 'gift'
        ? {
            type: 'gift',
            initiator: playerId,
            chooser,
            cards: [...cardIds],
            cardDetails: getCardDetails(cardIds),
          }
        : {
            type: 'competition',
            initiator: playerId,
            chooser,
            cards: grouping ?? [],
            cardDetails: getCardDetails(cardIds),
          };

    if (pendingAction.type === 'competition' && pendingAction.cards.length !== 2) {
      throw new Error('竞争行动需要提供分组');
    }

    return {
      ...base,
      publicState: {
        ...base.publicState,
        pendingAction,
        activePlayer: chooser,
        phase: phaseForSelect(chooser),
      },
    };
  };

  const onSelect: Handler = (engine, nextAction) => {
    if (nextAction.type !== 'RESOLVE_ACTION') return engine;

    const { playerId, selection } = nextAction;
    const s = engine.publicState;

    if (s.phase === 'game_over') throw new Error('游戏已结束');
    if (!s.pendingAction) throw new Error('没有待处理的选择');
    if (s.activePlayer !== playerId) throw new Error('不是你的回合');
    if (s.pendingAction.chooser !== playerId) throw new Error('当前玩家不能进行该选择');

    // 先检查是否需要结束轮次（基于当前状态）
    if (shouldEndRound(s)) {
      // 执行 RESOLVE_ACTION
      let nextPublic =
        s.pendingAction.type === 'gift'
          ? applyGift(s, s.pendingAction, selection)
          : applyCompetition(s, s.pendingAction, selection);

      const { nextState: scored } = applyScoring(nextPublic);
      const victory = checkVictory(scored);

      if (victory.winner) {
        return {
          ...engine,
          publicState: {
            ...scored,
            winner: victory.winner,
            isDraw: false,
            reason: victory.reason,
            phase: 'game_over',
          },
          meta: { ...engine.meta, needsRoundSetup: false },
        };
      }

      if (scored.round >= MAX_ROUNDS) {
        return {
          ...engine,
          publicState: {
            ...scored,
            winner: null,
            isDraw: true,
            reason: 'MAX_ROUNDS_DRAW',
            phase: 'game_over',
          },
          meta: { ...engine.meta, needsRoundSetup: false },
        };
      }

      if (nextAction.roundSetup) {
        return applyRoundSetupPayload({ ...engine, publicState: scored }, nextAction.roundSetup);
      }

      return {
        ...engine,
        publicState: { ...scored, phase: 'scoring' },
        meta: { ...engine.meta, needsRoundSetup: true },
      };
    }

    // 如果不需要结束轮次，则继续当前轮次
    let nextPublic =
      s.pendingAction.type === 'gift'
        ? applyGift(s, s.pendingAction, selection)
        : applyCompetition(s, s.pendingAction, selection);

    const nextPlayer = s.pendingAction.chooser;
    nextPublic = {
      ...nextPublic,
      pendingAction: null,
      activePlayer: nextPlayer,
      phase: phaseForDraw(nextPlayer),
    };

    return { ...engine, publicState: nextPublic };
  };

  if (action.type === 'APPLY_ROUND_SETUP') {
    const s = current.publicState;
    if (!current.meta.needsRoundSetup) throw new Error('当前不需要进行新一局的发牌');
    if (s.phase === 'game_over') throw new Error('游戏已结束');
    return applyRoundSetupPayload(current, action);
  }

  const newState = (() => {
    switch (current.publicState.phase) {
      case 'p1_draw':
      case 'p2_draw':
        return onDraw(current, action);
      case 'p1_action':
      case 'p2_action':
        return onAction(current, action);
      case 'p1_select':
      case 'p2_select':
        return onSelect(current, action);
      case 'scoring':
      case 'lobby':
      case 'game_over':
      default:
        return current;
    }
  })();

  const afterCount = countCards(newState);
  if (afterCount !== 20) {
    console.log('=== AFTER ===', JSON.stringify(action.type), afterCount);
    console.log('AFTER DETAIL:', JSON.stringify(countCardsDetailed(newState)));
    console.log('AFTER pendingAction:', newState.publicState.pendingAction ? JSON.stringify(newState.publicState.pendingAction) : 'null');
  }

  return newState;
}
