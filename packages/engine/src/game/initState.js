import { GEISHA_CARDS } from '../rules/geisha';
function createInitialGeishas() {
    const geishas = {};
    for (const [charmStr, data] of Object.entries(GEISHA_CARDS)) {
        const charm = parseInt(charmStr, 10);
        geishas[charm] = {
            ...data,
            id: charm,
            // 分值从配置中的 value 读取，而不是直接等于 charm
            value: data.value,
            charm,
            owner: null,
            items: {
                p1: [],
                p2: [],
            },
        };
    }
    return geishas;
}
export function initState(params) {
    const firstPlayer = params.firstPlayer ?? 'p1';
    const phase = firstPlayer === 'p1' ? 'p1_draw' : 'p2_draw';
    const gameState = {
        roomId: params.roomId,
        round: 1,
        phase,
        activePlayer: firstPlayer,
        deckCount: params.deck.length,
        geishas: createInitialGeishas(),
        players: {
            p1: {
                id: 'p1',
                name: params.players.p1.name,
                hand: [...params.hands.p1],
                secretCard: null,
                actionsUsed: { secret: false, discard: false, gift: false, competition: false },
                geishaCount: 0,
                totalCharm: 0,
                connected: true,
                socketId: params.players.p1.socketId,
            },
            p2: {
                id: 'p2',
                name: params.players.p2.name,
                hand: [...params.hands.p2],
                secretCard: null,
                actionsUsed: { secret: false, discard: false, gift: false, competition: false },
                geishaCount: 0,
                totalCharm: 0,
                connected: true,
                socketId: params.players.p2.socketId,
            },
        },
        pendingAction: null,
        discardPile: [],
        winner: null,
        isDraw: false,
        reason: null,
    };
    return {
        gameState,
        deck: [...params.deck],
        meta: { needsRoundSetup: false },
        rngState: params.rngState ?? 0,
    };
}
//# sourceMappingURL=initState.js.map