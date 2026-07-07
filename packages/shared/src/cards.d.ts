/**
 * Shared card/action metadata.
 *
 * This module is intentionally UI-safe and runtime-safe: it contains static
 * domain data plus tiny lookup helpers, but no reducer/game-room/socket logic.
 * Client can render cards/actions from here without depending on the engine.
 */
import type { ActionConfig, ActionType, GeishaCharm, ItemCard } from './types';
/**
 * 21 item cards used by each round.
 */
export declare const ITEM_CARDS: readonly ItemCard[];
export declare const ACTION_CONFIG: Readonly<Record<ActionType, ActionConfig>>;
export declare const CARD_PREFIX_CHARM_MAP: Readonly<Record<string, GeishaCharm>>;
export declare function getCharmFromCardId(cardId: string): GeishaCharm | null;
export declare function getItemCardById(cardId: string): ItemCard | undefined;
export declare function getCardDetails(cardIds: readonly string[]): ItemCard[];
export declare function getRequiredCardCount(actionType: ActionType): number;
//# sourceMappingURL=cards.d.ts.map