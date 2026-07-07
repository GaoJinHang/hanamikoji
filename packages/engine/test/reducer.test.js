import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../dist/index.js';
import { createPlayers } from './helpers.js';

test('initGame creates a deterministic, card-conserving initial state', () => {
  const stateA = engine.initGame(42, 'room_test', createPlayers(), 'p1');
  const stateB = engine.initGame(42, 'room_test', createPlayers(), 'p1');

  assert.deepEqual(stateA, stateB);
  assert.equal(stateA.gameState.phase, 'p1_draw');
  assert.equal(stateA.gameState.players.p1.hand.length, 6);
  assert.equal(stateA.gameState.players.p2.hand.length, 6);
  assert.equal(stateA.deck.length, 8);
  assert.equal(engine.countCards(stateA), engine.EXPECTED_VISIBLE_CARD_COUNT);
  engine.assertCardInvariants(stateA);
});

test('drawCard moves one deck card into the active player hand', () => {
  const initial = engine.initGame(7, 'room_test', createPlayers(), 'p1');
  const topCard = initial.deck.at(-1);

  const next = engine.reducer(initial, { type: 'DRAW_CARD', playerId: 'p1' });

  assert.equal(next.gameState.phase, 'p1_action');
  assert.equal(next.deck.length, initial.deck.length - 1);
  assert.equal(next.gameState.players.p1.hand.at(-1), topCard);
  assert.equal(initial.gameState.players.p1.hand.length, 6, 'reducer must not mutate input state');
  engine.assertCardInvariants(next);
});

test('discard action consumes exactly two selected cards and passes the turn', () => {
  let state = engine.initGame(11, 'room_test', createPlayers(), 'p1');
  state = engine.reducer(state, { type: 'DRAW_CARD', playerId: 'p1' });
  const discarded = state.gameState.players.p1.hand.slice(0, 2);

  const next = engine.reducer(state, {
    type: 'PLAY_ACTION',
    playerId: 'p1',
    actionType: 'discard',
    cardIds: discarded,
  });

  assert.equal(next.gameState.phase, 'p2_draw');
  assert.equal(next.gameState.activePlayer, 'p2');
  assert.deepEqual(next.gameState.discardPile, discarded);
  for (const cardId of discarded) {
    assert.equal(next.gameState.players.p1.hand.includes(cardId), false);
  }
  assert.equal(next.gameState.players.p1.actionsUsed.discard, true);
  engine.assertCardInvariants(next);
});

test('gift action creates a pending choice and resolution moves cards to scoring piles', () => {
  let state = engine.initGame(123, 'room_test', createPlayers(), 'p1');
  state = engine.reducer(state, { type: 'DRAW_CARD', playerId: 'p1' });
  const cards = state.gameState.players.p1.hand.slice(0, 3);

  state = engine.reducer(state, {
    type: 'PLAY_ACTION',
    playerId: 'p1',
    actionType: 'gift',
    cardIds: cards,
  });

  assert.equal(state.gameState.phase, 'p2_select');
  assert.equal(state.gameState.pendingAction?.type, 'gift');
  assert.deepEqual(state.gameState.pendingAction?.cards, cards);
  engine.assertCardInvariants(state);

  const resolved = engine.reducer(state, { type: 'RESOLVE_ACTION', playerId: 'p2', selection: 1 });

  assert.equal(resolved.gameState.pendingAction, null);
  assert.equal(resolved.gameState.phase, 'p2_draw');
  assert.equal(resolved.gameState.activePlayer, 'p2');
  engine.assertCardInvariants(resolved);
});

test('competition validates grouping before creating a pending action', () => {
  let state = engine.initGame(321, 'room_test', createPlayers(), 'p1');
  state = engine.reducer(state, { type: 'DRAW_CARD', playerId: 'p1' });
  const cards = state.gameState.players.p1.hand.slice(0, 4);

  assert.throws(() => {
    engine.reducer(state, {
      type: 'PLAY_ACTION',
      playerId: 'p1',
      actionType: 'competition',
      cardIds: cards,
      grouping: [[cards[0], cards[1]], [cards[1], cards[2]]],
    });
  }, /重复卡牌|不能重复|恰好包含/);

  const next = engine.reducer(state, {
    type: 'PLAY_ACTION',
    playerId: 'p1',
    actionType: 'competition',
    cardIds: cards,
    grouping: [cards.slice(0, 2), cards.slice(2, 4)],
  });

  assert.equal(next.gameState.pendingAction?.type, 'competition');
  assert.equal(next.gameState.phase, 'p2_select');
  engine.assertCardInvariants(next);
});
