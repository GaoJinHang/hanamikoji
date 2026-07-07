/**
 * Engine rules - Geisha
 *
 * Re-export public geisha definitions from shared to keep the engine API stable
 * while allowing the client to avoid a direct dependency on engine internals.
 */
import { GEISHA_CARDS, GEISHA_CHARM_LIST, VICTORY_CONDITIONS, getGeishaCardByCharm, } from '@hanamikoji/shared';
export { GEISHA_CARDS, GEISHA_CHARM_LIST, VICTORY_CONDITIONS, getGeishaCardByCharm, };
//# sourceMappingURL=geisha.js.map