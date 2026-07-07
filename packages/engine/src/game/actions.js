export const EngineActions = {
    drawCard: (playerId) => ({ type: 'DRAW_CARD', playerId }),
    playAction: (playerId, actionType, cardIds, grouping, roundSetup) => ({ type: 'PLAY_ACTION', playerId, actionType, cardIds, grouping, roundSetup }),
    resolveAction: (playerId, selection, roundSetup) => ({
        type: 'RESOLVE_ACTION',
        playerId,
        selection,
        roundSetup,
    }),
    applyRoundSetup: (deck, hands, rngState) => ({ type: 'APPLY_ROUND_SETUP', deck, hands, rngState }),
    setConnected: (playerId, connected, socketId) => ({ type: 'SET_CONNECTED', playerId, connected, socketId }),
};
//# sourceMappingURL=actions.js.map