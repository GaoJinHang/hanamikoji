const test = require('node:test');
const assert = require('node:assert');
const engine = require('../dist/index.js');

test('seed + actions => deterministic final state', () => {
  const seed = 123456789;

  // A short but valid action sequence for one turn:
  // p1 draws, then uses "discard" action with 2 cards from hand (after draw hand size 7).
  // We don't need to finish the whole game; just ensure determinism.
  const actions = [
    { type: 'DRAW_CARD', playerId: 'p1' },
    // choose 2 cards from p1 hand deterministically: we pick by index after replay start
    // Since actions must be static, we hardcode cardIds that are deterministic for the seed.
    // These ids are stable because deck composition is fixed.
    { type: 'PLAY_ACTION', playerId: 'p1', actionType: 'discard', cardIds: ['C1', 'C2'] },
  ];

  // We need real card ids. Derive them deterministically by initializing and reading state.
  const players = {
    p1: { socketId: 's1', playerId: 'p1', name: 'A' },
    p2: { socketId: 's2', playerId: 'p2', name: 'B' },
  };
  let s0 = engine.initGame(seed, 'room_test', players, 'p1');
  s0 = engine.reducer(s0, actions[0]); // after draw
  const hand = s0.publicState.players.p1.hand;

  // take first 2 cards as discard target
  const discardIds = [hand[0], hand[1]];
  const fixedActions = [actions[0], { ...actions[1], cardIds: discardIds }];

  const s1 = engine.replayGame(seed, fixedActions);
  const s2 = engine.replayGame(seed, fixedActions);

  assert.deepStrictEqual(s1, s2);
});
