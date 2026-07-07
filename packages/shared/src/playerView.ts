import type { GameState, PlayerId, PlayerState } from './types';

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
 * Build a per-player public view without exposing hidden opponent state.
 *
 * The full engine state intentionally keeps hidden information for deterministic
 * reducers. Any browser-visible transport can use this helper before sending a
 * state snapshot to one player.
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
