import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../dist/index.js';
import { createPlayers } from './helpers.js';

test('replay() equals sequential reducer application', () => {
  const initial = engine.initState({
    roomId: 'room_test',
    players: createPlayers(),
    hands: { p1: [], p2: [] },
    deck: [],
    firstPlayer: 'p1',
    rngState: 0,
  });

  const actions = [
    { type: 'SET_CONNECTED', playerId: 'p1', connected: true, socketId: 's1-new' },
    { type: 'SET_CONNECTED', playerId: 'p2', connected: false },
  ];

  const byReduce = actions.reduce((s, a) => engine.reducer(s, a), initial);
  const byReplay = engine.replay(initial, actions);

  assert.deepEqual(byReplay, byReduce);
});

test('seed + actions => deterministic final state', () => {
  const seed = 123456789;
  const initial = engine.initGame(seed, 'room_test', createPlayers(), 'p1');
  const afterDraw = engine.reducer(initial, { type: 'DRAW_CARD', playerId: 'p1' });
  const discardIds = afterDraw.gameState.players.p1.hand.slice(0, 2);
  const actions = [
    { type: 'DRAW_CARD', playerId: 'p1' },
    { type: 'PLAY_ACTION', playerId: 'p1', actionType: 'discard', cardIds: discardIds },
  ];

  const s1 = engine.replayGame(seed, actions);
  const s2 = engine.replayGame(seed, actions);

  assert.deepEqual(s1, s2);
  engine.assertCardInvariants(s1);
});
