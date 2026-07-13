import test from 'node:test';
import assert from 'node:assert/strict';
import type { GameState } from '@hanamikoji/shared';
import { createPlayerView } from '../src/game/playerView';

function createState(): GameState {
  return {
    roomId: 'ABC123',
    round: 1,
    phase: 'p1_action',
    activePlayer: 'p1',
    deckCount: 8,
    geishas: {
      2: { id: 2, charm: 2, value: 2, name: '樱', color: '#fff', owner: null, items: { p1: [], p2: [] } },
      3: { id: 3, charm: 3, value: 2, name: '梅', color: '#fff', owner: null, items: { p1: [], p2: [] } },
      4: { id: 4, charm: 4, value: 2, name: '兰', color: '#fff', owner: null, items: { p1: [], p2: [] } },
      5: { id: 5, charm: 5, value: 3, name: '竹', color: '#fff', owner: null, items: { p1: [], p2: [] } },
      6: { id: 6, charm: 6, value: 3, name: '菊', color: '#fff', owner: null, items: { p1: [], p2: [] } },
      7: { id: 7, charm: 7, value: 4, name: '玫瑰', color: '#fff', owner: null, items: { p1: [], p2: [] } },
      8: { id: 8, charm: 8, value: 5, name: '百合', color: '#fff', owner: null, items: { p1: [], p2: [] } },
    },
    players: {
      p1: {
        id: 'p1',
        name: 'Alice',
        hand: ['c1', 'c2'],
        actionsUsed: { secret: false, discard: false, gift: false, competition: false },
        secretCard: 's1',
        geishaCount: 0,
        totalCharm: 0,
        connected: true,
        socketId: 'socket-p1',
      },
      p2: {
        id: 'p2',
        name: 'Bob',
        hand: ['c3', 'c4', 'c5'],
        actionsUsed: { secret: false, discard: false, gift: false, competition: false },
        secretCard: 's2',
        geishaCount: 0,
        totalCharm: 0,
        connected: true,
        socketId: 'socket-p2',
      },
    },
    pendingAction: null,
    discardPile: [],
    winner: null,
    isDraw: false,
    reason: null,
  };
}

test('createPlayerView masks only the opponent hidden state', () => {
  const state = createState();
  const view = createPlayerView(state, 'p1');

  assert.deepEqual(view.players.p1.hand, ['c1', 'c2']);
  assert.equal(view.players.p1.secretCard, 's1');
  assert.equal(view.players.p1.socketId, 'socket-p1');

  assert.equal(view.players.p2.hand.length, 3);
  assert.ok(view.players.p2.hand.every(cardId => cardId.startsWith('__hidden_card_')));
  assert.equal(view.players.p2.secretCard, null);
  assert.equal(view.players.p2.socketId, undefined);

  assert.deepEqual(state.players.p2.hand, ['c3', 'c4', 'c5'], 'source state should not be mutated');
});

test('createPlayerView masks the opposite side for p2', () => {
  const state = createState();
  const view = createPlayerView(state, 'p2');

  assert.deepEqual(view.players.p2.hand, ['c3', 'c4', 'c5']);
  assert.equal(view.players.p2.secretCard, 's2');
  assert.equal(view.players.p2.socketId, 'socket-p2');

  assert.equal(view.players.p1.hand.length, 2);
  assert.ok(view.players.p1.hand.every(cardId => cardId.startsWith('__hidden_card_')));
  assert.equal(view.players.p1.secretCard, null);
  assert.equal(view.players.p1.socketId, undefined);
});
