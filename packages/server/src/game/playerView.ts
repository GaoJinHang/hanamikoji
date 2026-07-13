import type { GameState, PlayerId, PlayerState } from '@hanamikoji/shared';

function hiddenHand(cardCount: number): string[] {
  return Array.from({ length: cardCount }, (_, index) => `__hidden_card_${index + 1}`);
}

function maskOpponentState(player: PlayerState): PlayerState {
  return {
    ...player,
    hand: hiddenHand(player.hand.length),
    secretCard: null,
    socketId: undefined,
  };
}

/**
 * Build a per-player public view.
 *
 * EngineState intentionally keeps full hidden information so the reducer remains
 * simple and deterministic. The socket layer must never broadcast that full state
 * directly, otherwise one browser can inspect the opponent hand from devtools.
 */
export function createPlayerView(state: GameState, viewerId: PlayerId): GameState {
  const opponentId: PlayerId = viewerId === 'p1' ? 'p2' : 'p1';

  return {
    ...state,
    players: {
      ...state.players,
      [opponentId]: maskOpponentState(state.players[opponentId]),
    },
  };
}
