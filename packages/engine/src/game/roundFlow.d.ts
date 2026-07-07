import type { EngineState, RoundSetupPayload } from './types';
import type { PlayerId } from '@hanamikoji/shared';
export declare function applyRoundSetupPayload(engineState: EngineState, payload: RoundSetupPayload & {
    rngState?: number;
}): EngineState;
export declare function advanceAfterCompletedAction(engineState: EngineState, nextPlayer: PlayerId, roundSetup?: RoundSetupPayload): EngineState;
//# sourceMappingURL=roundFlow.d.ts.map