import { getCardDetails } from '../rules/cards';
import { applyCompetition, applyDiscard, applyGift, applySecret } from './actionEffects';
import { validateCompetitionGrouping, validateSelectedCards } from './actionValidation';
import { assertCardInvariants, countCards, countCardsDetailed, EXPECTED_VISIBLE_CARD_COUNT } from './cardAccounting';
import { getPlayer, otherPlayer, phaseForAction, phaseForDraw, phaseForSelect, setPlayerState, } from './playerUtils';
import { advanceAfterCompletedAction, applyRoundSetupPayload } from './roundFlow';
export { assertCardInvariants, countCards, countCardsDetailed, EXPECTED_VISIBLE_CARD_COUNT };
function assertGameIsActive(state) {
    if (state.phase === 'game_over')
        throw new Error('游戏已结束');
}
function assertActivePlayer(state, playerId) {
    if (state.activePlayer !== playerId)
        throw new Error('不是你的回合');
}
function assertPhase(state, expected, message) {
    if (state.phase !== expected)
        throw new Error(message);
}
function reduceSetConnected(state, action) {
    return setPlayerState(state, action.playerId, player => ({
        ...player,
        connected: action.connected,
        ...(action.socketId ? { socketId: action.socketId } : {}),
    }));
}
function reduceApplyRoundSetup(state, action) {
    if (!state.meta.needsRoundSetup)
        throw new Error('当前不需要进行新一局的发牌');
    if (state.gameState.phase === 'game_over')
        throw new Error('游戏已结束');
    return applyRoundSetupPayload(state, action);
}
function reduceDraw(state, action) {
    const { playerId } = action;
    const gameState = state.gameState;
    assertGameIsActive(gameState);
    assertActivePlayer(gameState, playerId);
    assertPhase(gameState, phaseForDraw(playerId), '当前不是抽牌阶段');
    if (state.deck.length <= 0)
        throw new Error('牌堆已空');
    const cardId = state.deck[state.deck.length - 1];
    const nextDeck = state.deck.slice(0, -1);
    const nextHand = [...getPlayer(gameState, playerId).hand, cardId];
    return {
        ...state,
        deck: nextDeck,
        gameState: {
            ...gameState,
            deckCount: nextDeck.length,
            phase: phaseForAction(playerId),
            players: {
                ...gameState.players,
                [playerId]: {
                    ...getPlayer(gameState, playerId),
                    hand: nextHand,
                },
            },
        },
    };
}
function buildPendingAction(playerId, actionType, cardIds, grouping) {
    const chooser = otherPlayer(playerId);
    if (actionType === 'gift') {
        return {
            type: 'gift',
            initiator: playerId,
            chooser,
            cards: [...cardIds],
            cardDetails: getCardDetails(cardIds),
        };
    }
    return {
        type: 'competition',
        initiator: playerId,
        chooser,
        cards: grouping ?? [],
        cardDetails: getCardDetails(cardIds),
    };
}
function reducePlayAction(state, action) {
    const { playerId, actionType, cardIds } = action;
    const gameState = state.gameState;
    const player = getPlayer(gameState, playerId);
    assertGameIsActive(gameState);
    assertActivePlayer(gameState, playerId);
    assertPhase(gameState, phaseForAction(playerId), '当前不是行动阶段');
    if (player.actionsUsed[actionType])
        throw new Error(`${actionType}行动已使用`);
    validateSelectedCards(gameState, playerId, actionType, cardIds);
    const nextActionsUsed = { ...player.actionsUsed, [actionType]: true };
    const nextHand = player.hand.filter(cardId => !cardIds.includes(cardId));
    const base = {
        ...state,
        gameState: {
            ...gameState,
            players: {
                ...gameState.players,
                [playerId]: {
                    ...player,
                    actionsUsed: nextActionsUsed,
                    hand: nextHand,
                },
            },
        },
    };
    if (actionType === 'secret') {
        const nextGameState = applySecret(base.gameState, playerId, cardIds[0]);
        return advanceAfterCompletedAction({ ...base, gameState: nextGameState }, otherPlayer(playerId), action.roundSetup);
    }
    if (actionType === 'discard') {
        const nextGameState = applyDiscard(base.gameState, playerId, cardIds);
        return advanceAfterCompletedAction({ ...base, gameState: nextGameState }, otherPlayer(playerId), action.roundSetup);
    }
    const grouping = actionType === 'competition'
        ? validateCompetitionGrouping(cardIds, action.grouping)
        : undefined;
    const pendingAction = buildPendingAction(playerId, actionType, cardIds, grouping);
    return {
        ...base,
        gameState: {
            ...base.gameState,
            pendingAction,
            activePlayer: pendingAction.chooser,
            phase: phaseForSelect(pendingAction.chooser),
        },
    };
}
function reduceResolveAction(state, action) {
    const { playerId, selection } = action;
    const gameState = state.gameState;
    const pendingAction = gameState.pendingAction;
    assertGameIsActive(gameState);
    if (!pendingAction)
        throw new Error('没有待处理的选择');
    assertActivePlayer(gameState, playerId);
    assertPhase(gameState, phaseForSelect(playerId), '当前不是选择阶段');
    if (pendingAction.chooser !== playerId)
        throw new Error('当前玩家不能进行该选择');
    const nextGameState = pendingAction.type === 'gift'
        ? applyGift(gameState, pendingAction, selection)
        : applyCompetition(gameState, pendingAction, selection);
    return advanceAfterCompletedAction({ ...state, gameState: nextGameState }, playerId, action.roundSetup);
}
export function reducer(state, action) {
    switch (action.type) {
        case 'SET_CONNECTED':
            return reduceSetConnected(state, action);
        case 'APPLY_ROUND_SETUP':
            return reduceApplyRoundSetup(state, action);
        case 'DRAW_CARD':
            return reduceDraw(state, action);
        case 'PLAY_ACTION':
            return reducePlayAction(state, action);
        case 'RESOLVE_ACTION':
            return reduceResolveAction(state, action);
        default:
            return state;
    }
}
//# sourceMappingURL=reducer.js.map