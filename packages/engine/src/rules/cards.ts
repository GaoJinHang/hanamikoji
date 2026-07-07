/**
 * Engine rules - Cards
 *
 * The canonical public card/action definitions live in @hanamikoji/shared so UI
 * code can render cards without importing the engine package. This module keeps
 * the existing engine API stable by re-exporting those pure helpers.
 */
export {
  ACTION_CONFIG,
  CARD_PREFIX_CHARM_MAP,
  ITEM_CARDS,
  getCardDetails,
  getCharmFromCardId,
  getItemCardById,
  getRequiredCardCount,
} from '@hanamikoji/shared';
