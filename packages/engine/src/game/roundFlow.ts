import { MAX_ROUNDS } from '@hanamikoji/shared';
import type { EngineState, RoundSetupPayload } from './types';
import type { PlayerId } from '@hanamikoji/shared';
import { createRoundSetup } from '../rules/deck';
import { applyScoring, checkVictory } from './winCheck';
import {
  clearGeishaItemsForNextRound,
  phaseForDraw,
  resetPlayerForRound,
  shouldEndRound,
} from './playerUtils';

export function applyRoundSetupPayload(engineState: EngineState, payload: RoundSetupPayload & { rngState?: number }): EngineState {
  const nextRound = engineState.gameState.round + 1;
  const firstPlayer: PlayerId = nextRound % 2 === 1 ? 'p1' : 'p2';

  return {
    ...engineState,
    deck: [...payload.deck],
    rngState: payload.rngState ?? engineState.rngState,
    gameState: {
      ...engineState.gameState,
      deckCount: payload.deck.length,
      round: nextRound,
      activePlayer: firstPlayer,
      phase: phaseForDraw(firstPlayer),
      players: {
        p1: resetPlayerForRound(engineState.gameState.players.p1, payload.hands.p1),
        p2: resetPlayerForRound(engineState.gameState.players.p2, payload.hands.p2),
      },
      discardPile: [],
      pendingAction: null,
      geishas: clearGeishaItemsForNextRound(engineState.gameState.geishas),
    },
    meta: { ...engineState.meta, needsRoundSetup: false },
  };
}

function startNextRound(engineState: EngineState, roundSetup?: RoundSetupPayload): EngineState {
  if (roundSetup) return applyRoundSetupPayload(engineState, roundSetup);

  const setup = createRoundSetup(engineState.rngState);
  return applyRoundSetupPayload(engineState, setup);
}

function finishRound(engineState: EngineState, roundSetup?: RoundSetupPayload): EngineState {
  const { nextState: scored } = applyScoring(engineState.gameState);
  const victory = checkVictory(scored);

  if (victory.winner) {
    return {
      ...engineState,
      gameState: {
        ...scored,
        winner: victory.winner,
        isDraw: false,
        reason: victory.reason,
        phase: 'game_over',
      },
      meta: { ...engineState.meta, needsRoundSetup: false },
    };
  }

  if (scored.round >= MAX_ROUNDS) {
    return {
      ...engineState,
      gameState: {
        ...scored,
        winner: null,
        isDraw: true,
        reason: 'MAX_ROUNDS_DRAW',
        phase: 'game_over',
      },
      meta: { ...engineState.meta, needsRoundSetup: false },
    };
  }

  return startNextRound({ ...engineState, gameState: scored }, roundSetup);
}

export function advanceAfterCompletedAction(
  engineState: EngineState,
  nextPlayer: PlayerId,
  roundSetup?: RoundSetupPayload
): EngineState {
  const currentGameState = engineState.gameState;

  if (shouldEndRound(currentGameState)) {
    return finishRound(engineState, roundSetup);
  }

  return {
    ...engineState,
    gameState: {
      ...currentGameState,
      activePlayer: nextPlayer,
      phase: phaseForDraw(nextPlayer),
    },
  };
}
