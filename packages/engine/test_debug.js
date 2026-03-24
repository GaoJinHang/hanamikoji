import('./dist/game/reducer.js').then(m => {
  const initGame = m.initGame;
  const players = { p1: { socketId: 's1', playerId: 'p1', name: 'P1' }, p2: { socketId: 's2', playerId: 'p2', name: 'P2' } };
  const state = initGame(12345, 'room1', players, 'p1');
  console.log('=== Initial State ===');
  console.log('deck length:', state.deck.length);
  console.log('deck:', JSON.stringify(state.deck));
  console.log('p1_hand length:', state.publicState.players.p1.hand.length);
  console.log('p2_hand length:', state.publicState.players.p2.hand.length);
  console.log('p1_hand:', JSON.stringify(state.publicState.players.p1.hand));
  console.log('p2_hand:', JSON.stringify(state.publicState.players.p2.hand));

  const total = state.deck.length + state.publicState.players.p1.hand.length + state.publicState.players.p2.hand.length;
  console.log('Total (deck + hands):', total);
});