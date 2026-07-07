import type { GameState, PendingAction, PlayerId } from '@hanamikoji/shared';
/**
 * Effects assume reducePlayAction has already marked the action as used and removed
 * submitted cards from the initiator hand. That keeps card ownership transfer in one place.
 */
export declare function applySecret(state: GameState, playerId: PlayerId, cardId: string): GameState;
export declare function applyDiscard(state: GameState, _playerId: PlayerId, discarded: readonly string[]): GameState;
export declare function applyGift(state: GameState, pending: Extract<PendingAction, {
    type: 'gift';
}>, selection: number): GameState;
export declare function applyCompetition(state: GameState, pending: Extract<PendingAction, {
    type: 'competition';
}>, selection: number): GameState;
//# sourceMappingURL=actionEffects.d.ts.map