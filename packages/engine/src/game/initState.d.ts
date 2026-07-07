/**
 * Engine - Game init state (pure)
 */
import { RoomPlayer, PlayerId } from '@hanamikoji/shared';
import { EngineState } from './types';
export interface InitStateParams {
    roomId: string;
    players: {
        p1: RoomPlayer;
        p2: RoomPlayer;
    };
    hands: {
        p1: string[];
        p2: string[];
    };
    deck: string[];
    firstPlayer?: PlayerId;
    rngState?: number;
}
export declare function initState(params: InitStateParams): EngineState;
//# sourceMappingURL=initState.d.ts.map