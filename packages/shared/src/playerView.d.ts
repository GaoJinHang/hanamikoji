import type { GameState, PlayerId } from './types';
/**
 * Build a per-player public view without exposing hidden opponent state.
 *
 * The full engine state intentionally keeps hidden information for deterministic
 * reducers. Any browser-visible transport can use this helper before sending a
 * state snapshot to one player.
 */
export declare function createPlayerView(state: GameState, viewerId: PlayerId): GameState;
//# sourceMappingURL=playerView.d.ts.map