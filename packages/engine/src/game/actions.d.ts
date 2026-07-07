/**
 * Engine - action creators (optional utility)
 */
import type { ActionType, PlayerId } from '@hanamikoji/shared';
import type { EngineAction, RoundSetupPayload } from './types';
export declare const EngineActions: {
    readonly drawCard: (playerId: PlayerId) => EngineAction;
    readonly playAction: (playerId: PlayerId, actionType: ActionType, cardIds: string[], grouping?: string[][], roundSetup?: RoundSetupPayload) => EngineAction;
    readonly resolveAction: (playerId: PlayerId, selection: number, roundSetup?: RoundSetupPayload) => EngineAction;
    readonly applyRoundSetup: (deck: string[], hands: {
        p1: string[];
        p2: string[];
    }, rngState?: number) => EngineAction;
    readonly setConnected: (playerId: PlayerId, connected: boolean, socketId?: string) => EngineAction;
};
//# sourceMappingURL=actions.d.ts.map