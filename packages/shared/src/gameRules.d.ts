/**
 * Shared game rule constants that are safe for both UI and engine.
 */
import type { GeishaCharm, GeishaName, GeishaValue, VictoryConditions } from './types';
export interface GeishaDefinition {
    charm: GeishaCharm;
    name: GeishaName;
    color: string;
    value: GeishaValue;
}
export declare const PLAYER_IDS: readonly ["p1", "p2"];
export declare const ACTION_TYPES: readonly ["secret", "discard", "gift", "competition"];
export declare const GEISHA_CHARM_LIST: readonly [2, 3, 4, 5, 6, 7, 8];
export declare const VICTORY_CONDITIONS: VictoryConditions;
export declare const GEISHA_CARDS: Readonly<Record<GeishaCharm, GeishaDefinition>>;
export declare function getGeishaCardByCharm(charm: GeishaCharm): GeishaDefinition | undefined;
//# sourceMappingURL=gameRules.d.ts.map