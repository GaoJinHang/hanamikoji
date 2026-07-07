/**
 * Engine - scoring + win check (pure)
 */
import { GameState, PlayerId } from '@hanamikoji/shared';
export interface ScoreResult {
    p1: {
        geishaCount: number;
        totalCharm: number;
    };
    p2: {
        geishaCount: number;
        totalCharm: number;
    };
}
export interface VictoryResult {
    winner: PlayerId | null;
    reason: string | null;
}
export declare function applyScoring(state: GameState): {
    nextState: GameState;
    score: ScoreResult;
};
export declare function checkVictory(state: GameState): VictoryResult;
//# sourceMappingURL=winCheck.d.ts.map