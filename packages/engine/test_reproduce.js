import('./dist/index.js').then(engine => {
  const reducer = engine.reducer;
  const initGame = engine.initGame;

  const players = { p1: { socketId: 's1', playerId: 'p1', name: 'P1' }, p2: { socketId: 's2', playerId: 'p2', name: 'P2' } };
  const state = initGame(3310558080, 'room1', players, 'p1');

  console.log('Initial deck length:', state.deck.length);
  console.log('p1_hand:', state.publicState.players.p1.hand);
  console.log('p2_hand:', state.publicState.players.p2.hand);
});