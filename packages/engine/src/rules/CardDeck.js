import { ITEM_CARDS } from './cards';
import { shuffleWithState } from './deck';
export { nextRNG } from './rng';
/** Draw from the top (last element) immutably. */
export function drawCard(deck) {
    if (deck.length === 0)
        return { card: null, deck: [...deck] };
    const card = deck[deck.length - 1] ?? null;
    return { card, deck: deck.slice(0, -1) };
}
/** Remove a card by id immutably. */
export function removeCardFromDeck(deck, cardId) {
    return deck.filter(card => card.id !== cardId);
}
/** Create initial deck (ItemCard[]) deterministically. */
export function createInitialDeck(rngState) {
    const res = shuffleWithState([...ITEM_CARDS], rngState);
    return { deck: res.shuffled, rngState: res.rngState };
}
//# sourceMappingURL=CardDeck.js.map