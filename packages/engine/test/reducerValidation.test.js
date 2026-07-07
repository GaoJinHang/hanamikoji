import test from 'node:test';
import assert from 'node:assert/strict';
import { getCardDetails, initGame, reducer } from '../dist/index.js';

const players = {
  p1: { socketId: 's1', playerId: 'p1', name: 'A' },
  p2: { socketId: 's2', playerId: 'p2', name: 'B' },
};

function allActionsUsed() {
  return { secret: true, discard: true, gift: true, competition: true };
}

function afterP1Draw(seed = 42) {
  return reducer(initGame(seed, 'room_validation', players, 'p1'), { type: 'DRAW_CARD', playerId: 'p1' });
}

test('PLAY_ACTION rejects duplicate selected cards', () => {
  const state = afterP1Draw();
  const [cardId] = state.gameState.players.p1.hand;

  assert.throws(
    () => reducer(state, { type: 'PLAY_ACTION', playerId: 'p1', actionType: 'discard', cardIds: [cardId, cardId] }),
    /不能重复/
  );
});

test('competition grouping must exactly match selected cards', () => {
  const state = afterP1Draw(123);
  const hand = state.gameState.players.p1.hand;
  const selected = hand.slice(0, 4);
  const wrongGrouping = [[selected[0], selected[1]], [selected[2], hand[4]]];

  assert.throws(
    () => reducer(state, {
      type: 'PLAY_ACTION',
      playerId: 'p1',
      actionType: 'competition',
      cardIds: selected,
      grouping: wrongGrouping,
    }),
    /竞争分组必须且只能包含/
  );
});

test('resolving the final pending action starts the next round automatically', () => {
  const base = initGame(7, 'room_round', players, 'p1');
  const giftCards = ['ume_1', 'ran_1', 'take_1'];
  const state = {
    ...base,
    rngState: 99,
    deck: [],
    gameState: {
      ...base.gameState,
      round: 1,
      phase: 'p2_select',
      activePlayer: 'p2',
      deckCount: 0,
      players: {
        p1: { ...base.gameState.players.p1, hand: [], actionsUsed: allActionsUsed() },
        p2: { ...base.gameState.players.p2, hand: [], actionsUsed: allActionsUsed() },
      },
      pendingAction: {
        type: 'gift',
        initiator: 'p1',
        chooser: 'p2',
        cards: giftCards,
        cardDetails: getCardDetails(giftCards),
      },
      geishas: {
        ...base.gameState.geishas,
        2: { ...base.gameState.geishas[2], owner: 'p1' },
      },
    },
  };

  const next = reducer(state, { type: 'RESOLVE_ACTION', playerId: 'p2', selection: 0 });

  assert.equal(next.gameState.round, 2);
  assert.equal(next.gameState.phase, 'p2_draw');
  assert.equal(next.gameState.pendingAction, null);
  assert.equal(next.meta.needsRoundSetup, false);
  assert.equal(next.gameState.players.p1.hand.length, 6);
  assert.equal(next.gameState.players.p2.hand.length, 6);
  assert.equal(next.deck.length, 8);
  assert.equal(next.gameState.geishas[2].owner, 'p1');
  assert.deepEqual(next.gameState.geishas[2].items, { p1: [], p2: [] });
});
