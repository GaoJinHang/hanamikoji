import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../dist/index.js';
import { choose, createPlayers, createRng, shuffleWithRng } from './helpers.js';

const ACTION_TYPES = ['secret', 'discard', 'gift', 'competition'];
const MAX_STEPS_PER_GAME = 120;
const DEFAULT_SIM_COUNT = 200;
const SIMULATION_COUNT = Number.parseInt(process.env.SIM_COUNT ?? String(DEFAULT_SIM_COUNT), 10);

function competitionGroupings(cards) {
  const [a, b, c, d] = cards;
  return [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ];
}

function legalActions(state, rng) {
  const s = state.gameState;
  const active = s.activePlayer;

  if (s.phase === 'game_over') return [];

  if (s.phase === 'p1_draw' || s.phase === 'p2_draw') {
    return [{ type: 'DRAW_CARD', playerId: active }];
  }

  if (s.phase === 'p1_action' || s.phase === 'p2_action') {
    const player = s.players[active];
    const hand = [...player.hand];
    const candidates = [];

    for (const actionType of ACTION_TYPES) {
      if (player.actionsUsed[actionType]) continue;
      const requiredCount = engine.getRequiredCardCount(actionType);
      if (hand.length < requiredCount) continue;

      const chosen = shuffleWithRng(hand, rng).slice(0, requiredCount);
      if (actionType === 'competition') {
        for (const grouping of competitionGroupings(chosen)) {
          candidates.push({ type: 'PLAY_ACTION', playerId: active, actionType, cardIds: chosen, grouping });
        }
      } else {
        candidates.push({ type: 'PLAY_ACTION', playerId: active, actionType, cardIds: chosen });
      }
    }

    return candidates;
  }

  if (s.phase === 'p1_select' || s.phase === 'p2_select') {
    const pending = s.pendingAction;
    if (!pending) return [];
    const optionCount = pending.type === 'gift' ? pending.cards.length : pending.cards.length;
    return Array.from({ length: optionCount }, (_, selection) => ({
      type: 'RESOLVE_ACTION',
      playerId: pending.chooser,
      selection,
    }));
  }

  return [];
}

function simulate(seed) {
  let state = engine.initGame(seed, 'sim_room', createPlayers(), 'p1');
  const rng = createRng(seed);
  const history = [];

  engine.assertCardInvariants(state);

  for (let step = 1; step <= MAX_STEPS_PER_GAME; step += 1) {
    if (state.gameState.phase === 'game_over') {
      return { winner: state.gameState.winner, steps: step - 1, history };
    }

    const actions = legalActions(state, rng);
    if (actions.length === 0) {
      throw new Error(`No legal action at phase ${state.gameState.phase}`);
    }

    const action = choose(actions, rng);
    history.push(action);
    state = engine.reducer(state, action);
    engine.assertCardInvariants(state);
  }

  throw new Error(`Possible infinite game. seed=${seed}, history=${JSON.stringify(history)}`);
}

test(`Monte Carlo simulation keeps invariants across ${SIMULATION_COUNT} games`, () => {
  let completed = 0;
  for (let i = 0; i < SIMULATION_COUNT; i += 1) {
    const seed = Number((BigInt(i) * 1103515245n + 12345n) & 0xffffffffn);
    const result = simulate(seed);
    assert.ok(result.steps > 0);
    completed += 1;
  }

  assert.equal(completed, SIMULATION_COUNT);
});
