const test = require('node:test');
const assert = require('node:assert');

const engine = require('../dist/index.js');

test('replay() equals sequential reducer application', () => {
  const initial = engine.initState({
    roomId: 'room_test',
    players: {
      p1: { socketId: 's1', playerId: 'p1', name: 'A' },
      p2: { socketId: 's2', playerId: 'p2', name: 'B' },
    },
    hands: { p1: [], p2: [] },
    deck: [],
    firstPlayer: 'p1',
  });

  const actions = [
    { type: 'SET_CONNECTED', playerId: 'p1', connected: true, socketId: 's1' },
    { type: 'SET_CONNECTED', playerId: 'p2', connected: true, socketId: 's2' },
  ];

  const byReduce = actions.reduce((s, a) => engine.reducer(s, a), initial);
  const byReplay = engine.replay(initial, actions);

  assert.deepStrictEqual(byReplay, byReduce);
});
