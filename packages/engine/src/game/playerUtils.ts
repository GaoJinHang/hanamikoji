import type { GameState, GeishaCharm, GeishaState, PlayerActions, PlayerId } from '@hanamikoji/shared';
import type { EngineState } from './types';

export const PLAYER_IDS: readonly PlayerId[] = ['p1', 'p2'];

export function otherPlayer(playerId: PlayerId): PlayerId {
  return playerId === 'p1' ? 'p2' : 'p1';
}

export function getPlayer(state: GameState, playerId: PlayerId): GameState['players'][PlayerId] {
  return state.players[playerId];
}

export function countRemainingActions(actionsUsed: PlayerActions): number {
  return Object.values(actionsUsed).filter(used => !used).length;
}

export function createFreshActionsUsed(): PlayerActions {
  return { secret: false, discard: false, gift: false, competition: false };
}

export function shouldEndRound(state: GameState): boolean {
  return PLAYER_IDS.every(playerId => countRemainingActions(getPlayer(state, playerId).actionsUsed) === 0);
}

export function phaseForDraw(playerId: PlayerId): GameState['phase'] {
  return playerId === 'p1' ? 'p1_draw' : 'p2_draw';
}

export function phaseForAction(playerId: PlayerId): GameState['phase'] {
  return playerId === 'p1' ? 'p1_action' : 'p2_action';
}

export function phaseForSelect(playerId: PlayerId): GameState['phase'] {
  return playerId === 'p1' ? 'p1_select' : 'p2_select';
}

export function setPlayerState<T extends EngineState | GameState>(
  root: T,
  playerId: PlayerId,
  patch: (player: GameState['players'][PlayerId]) => GameState['players'][PlayerId]
): T {
  if ('gameState' in root) {
    const gameState = root.gameState;
    return {
      ...root,
      gameState: {
        ...gameState,
        players: {
          ...gameState.players,
          [playerId]: patch(gameState.players[playerId]),
        },
      },
    } as T;
  }

  return {
    ...root,
    players: {
      ...root.players,
      [playerId]: patch(root.players[playerId]),
    },
  } as T;
}

export function resetPlayerForRound(
  player: GameState['players'][PlayerId],
  hand: readonly string[]
): GameState['players'][PlayerId] {
  return {
    ...player,
    actionsUsed: createFreshActionsUsed(),
    hand: [...hand],
    secretCard: null,
  };
}

export function clearGeishaItemsForNextRound(geishas: GameState['geishas']): Record<GeishaCharm, GeishaState> {
  const next = {} as Record<GeishaCharm, GeishaState>;

  for (const [charmValue, geisha] of Object.entries(geishas)) {
    const charm = Number(charmValue) as GeishaCharm;
    next[charm] = {
      ...geisha,
      items: { p1: [], p2: [] },
      // Keep owner across rounds. applyScoring only changes ownership on majority;
      // ties should preserve current ownership.
      owner: geisha.owner,
    };
  }

  return next;
}
