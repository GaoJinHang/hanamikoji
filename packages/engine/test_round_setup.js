import('./dist/index.js').then(engine => {
  const reducer = engine.reducer;
  const initGame = engine.initGame;

  const players = { p1: { socketId: 's1', playerId: 'p1', name: 'P1' }, p2: { socketId: 's2', playerId: 'p2', name: 'P2' } };
  let state = initGame(3310558080, 'room1', players, 'p1');

  console.log('Initial state:');
  console.log('  deck:', state.deck.length);
  console.log('  p1_hand:', state.publicState.players.p1.hand.length);
  console.log('  p2_hand:', state.publicState.players.p2.hand.length);
  console.log('  discardPile:', state.publicState.discardPile?.length ?? 0);

  // 模拟一轮游戏，使用不同的行动类型
  const actions = [
    { type: 'DRAW_CARD', playerId: 'p1' },
    { type: 'PLAY_ACTION', playerId: 'p1', actionType: 'discard', cardIds: ['take_1', 'take_3'] },
    { type: 'DRAW_CARD', playerId: 'p2' },
    { type: 'PLAY_ACTION', playerId: 'p2', actionType: 'secret', cardIds: ['kiku_1'] },
    { type: 'DRAW_CARD', playerId: 'p1' },
    { type: 'PLAY_ACTION', playerId: 'p1', actionType: 'gift', cardIds: ['yuri_5', 'bara_3', 'ran_1'] },
    { type: 'RESOLVE_ACTION', playerId: 'p2', selection: 0 },
    { type: 'DRAW_CARD', playerId: 'p2' },
    { type: 'PLAY_ACTION', playerId: 'p2', actionType: 'competition', cardIds: ['yuri_1', 'ume_1', 'yuri_4', 'bara_1'], grouping: [['yuri_1', 'ume_1'], ['yuri_4', 'bara_1']] },
    { type: 'RESOLVE_ACTION', playerId: 'p1', selection: 0 },
  ];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    state = reducer(state, action);
    console.log(`After action ${i + 1} (${action.type}):`);
    console.log('  deck:', state.deck.length);
    console.log('  p1_hand:', state.publicState.players.p1.hand.length);
    console.log('  p2_hand:', state.publicState.players.p2.hand.length);
    console.log('  discardPile:', state.publicState.discardPile?.length ?? 0);
    console.log('  needsRoundSetup:', state.meta.needsRoundSetup);
  }

  console.log('Round ended, checking if new round setup is needed:', state.meta.needsRoundSetup);
  
  // 如果需要进行新的一轮，应用轮次设置
  if (state.meta.needsRoundSetup) {
    const setup = engine.createRoundSetup(state.rngState);
    state = reducer(state, { type: 'APPLY_ROUND_SETUP', ...setup });
    
    console.log('After round setup:');
    console.log('  deck:', state.deck.length);
    console.log('  p1_hand:', state.publicState.players.p1.hand.length);
    console.log('  p2_hand:', state.publicState.players.p2.hand.length);
    console.log('  discardPile:', state.publicState.discardPile?.length ?? 0);
  }
});