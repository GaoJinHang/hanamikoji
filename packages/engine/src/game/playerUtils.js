export const PLAYER_IDS = ['p1', 'p2'];
export function otherPlayer(playerId) {
    return playerId === 'p1' ? 'p2' : 'p1';
}
export function getPlayer(state, playerId) {
    return state.players[playerId];
}
export function countRemainingActions(actionsUsed) {
    return Object.values(actionsUsed).filter(used => !used).length;
}
export function createFreshActionsUsed() {
    return { secret: false, discard: false, gift: false, competition: false };
}
export function shouldEndRound(state) {
    return PLAYER_IDS.every(playerId => countRemainingActions(getPlayer(state, playerId).actionsUsed) === 0);
}
export function phaseForDraw(playerId) {
    return playerId === 'p1' ? 'p1_draw' : 'p2_draw';
}
export function phaseForAction(playerId) {
    return playerId === 'p1' ? 'p1_action' : 'p2_action';
}
export function phaseForSelect(playerId) {
    return playerId === 'p1' ? 'p1_select' : 'p2_select';
}
export function setPlayerState(root, playerId, patch) {
    if ('gameState' in root) {
        const gameState = root.gameState;
        return {
            ...root,
            gameState: {
                ...gameState,
                players: {
                    ...gameState.players,
                    [playerId]: patch(gameState.players[playerId]),
                },
            },
        };
    }
    return {
        ...root,
        players: {
            ...root.players,
            [playerId]: patch(root.players[playerId]),
        },
    };
}
export function resetPlayerForRound(player, hand) {
    return {
        ...player,
        actionsUsed: createFreshActionsUsed(),
        hand: [...hand],
        secretCard: null,
    };
}
export function clearGeishaItemsForNextRound(geishas) {
    const next = {};
    for (const [charmValue, geisha] of Object.entries(geishas)) {
        const charm = Number(charmValue);
        next[charm] = {
            ...geisha,
            items: { p1: [], p2: [] },
            // Keep owner across rounds. applyScoring only changes ownership on majority;
            // ties should preserve current ownership.
            owner: geisha.owner,
        };
    }
    return next;
}
//# sourceMappingURL=playerUtils.js.map