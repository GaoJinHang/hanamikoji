/**
 * Engine rules - Deck.
 *
 * This module owns deterministic shuffling/dealing only. It does not know about
 * sockets, rooms, or UI state, which keeps replays and tests reproducible.
 */
import { ITEM_CARDS } from './cards';
import { createRNGState, nextRNG } from './rng';
import { initState } from '../game/initState';
function getCardId(card) {
    return typeof card === 'string' ? card : card.id;
}
function deepFreeze(obj) {
    if (obj === null || typeof obj !== 'object')
        return obj;
    Object.freeze(obj);
    const record = obj;
    for (const key of Reflect.ownKeys(record)) {
        const value = record[key];
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            deepFreeze(value);
        }
    }
    return obj;
}
/**
 * Deterministic shuffle that consumes and returns RNGState.
 */
export function shuffleWithState(array, rngState) {
    const shuffled = [...array];
    let state = rngState >>> 0;
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const next = nextRNG(state);
        state = next.state;
        const j = Math.floor(next.value * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return { shuffled, rngState: state };
}
/**
 * Deterministic shuffle convenience wrapper.
 */
export function shuffle(array, rngState) {
    return shuffleWithState(array, rngState);
}
export function dealCards(cards, playerCount, cardsPerPlayer, rngState) {
    const { shuffled, rngState: nextState } = shuffleWithState(cards, rngState);
    const ids = shuffled.map(getCardId);
    if (typeof cardsPerPlayer === 'number') {
        const totalCards = cardsPerPlayer * playerCount;
        const picked = ids.slice(0, totalCards);
        const hands = Array.from({ length: playerCount }, (_, playerIndex) => picked.filter((_, cardIndex) => cardIndex % playerCount === playerIndex));
        return { hands, rngState: nextState };
    }
    // Compatibility path: use each inner array length as the hand size.
    let offset = 0;
    const hands = cardsPerPlayer.map((templateHand) => {
        const hand = ids.slice(offset, offset + templateHand.length);
        offset += templateHand.length;
        return hand;
    });
    return { hands, rngState: nextState };
}
function dealRoundCards(rngState) {
    const cardIds = ITEM_CARDS.map(card => card.id);
    const { shuffled, rngState: nextState } = shuffleWithState(cardIds, rngState);
    // Remove one hidden card. The deck top is represented by the last element.
    const deckAfterHidden = shuffled.slice(0, -1);
    const deckLen = deckAfterHidden.length;
    const p1 = Array.from({ length: 6 }, (_, i) => deckAfterHidden[deckLen - 1 - i * 2]);
    const p2 = Array.from({ length: 6 }, (_, i) => deckAfterHidden[deckLen - 2 - i * 2]);
    const deck = deckAfterHidden.slice(0, deckLen - 12);
    return { deck, hands: { p1, p2 }, rngState: nextState };
}
/**
 * Create initial game setup.
 */
export function initGame(seed, roomId, players, firstPlayer = 'p1') {
    const rngState = createRNGState(seed);
    const setup = dealRoundCards(rngState);
    const state = initState({
        roomId,
        players,
        hands: setup.hands,
        deck: setup.deck,
        firstPlayer,
        rngState: setup.rngState,
    });
    const devMode = typeof globalThis === 'object'
        && '__HANAMIKOJI_DEV__' in globalThis
        && Boolean(globalThis.__HANAMIKOJI_DEV__);
    if (devMode) {
        deepFreeze(state);
    }
    return state;
}
/**
 * Backwards-compatible alias. Keeping existing call sites working while enabling seed replay.
 */
export function createGameSetup(roomId, players, firstPlayer = 'p1', seed = 0) {
    return initGame(seed, roomId, players, firstPlayer);
}
/**
 * Create a new round setup with deterministic RNG state.
 */
export function createRoundSetup(rngState) {
    return dealRoundCards(rngState);
}
//# sourceMappingURL=deck.js.map