import type { ActionType, GameState, PlayerId } from '@hanamikoji/shared';
export declare function validateSelectedCards(state: GameState, playerId: PlayerId, actionType: ActionType, cardIds: readonly string[]): void;
export declare function validateCompetitionGrouping(cardIds: readonly string[], grouping: readonly string[][] | undefined): string[][];
//# sourceMappingURL=actionValidation.d.ts.map