import type { GameState, GeishaCharm, GeishaState, PlayerActions, PlayerId } from '@hanamikoji/shared';
import type { EngineState } from './types';
export declare const PLAYER_IDS: readonly PlayerId[];
export declare function otherPlayer(playerId: PlayerId): PlayerId;
export declare function getPlayer(state: GameState, playerId: PlayerId): GameState['players'][PlayerId];
export declare function countRemainingActions(actionsUsed: PlayerActions): number;
export declare function createFreshActionsUsed(): PlayerActions;
export declare function shouldEndRound(state: GameState): boolean;
export declare function phaseForDraw(playerId: PlayerId): GameState['phase'];
export declare function phaseForAction(playerId: PlayerId): GameState['phase'];
export declare function phaseForSelect(playerId: PlayerId): GameState['phase'];
export declare function setPlayerState<T extends EngineState | GameState>(root: T, playerId: PlayerId, patch: (player: GameState['players'][PlayerId]) => GameState['players'][PlayerId]): T;
export declare function resetPlayerForRound(player: GameState['players'][PlayerId], hand: readonly string[]): GameState['players'][PlayerId];
export declare function clearGeishaItemsForNextRound(geishas: GameState['geishas']): Record<GeishaCharm, GeishaState>;
//# sourceMappingURL=playerUtils.d.ts.map