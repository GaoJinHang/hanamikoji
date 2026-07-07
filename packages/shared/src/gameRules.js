export const PLAYER_IDS = ['p1', 'p2'];
export const ACTION_TYPES = ['secret', 'discard', 'gift', 'competition'];
export const GEISHA_CHARM_LIST = [2, 3, 4, 5, 6, 7, 8];
export const VICTORY_CONDITIONS = {
    geishaCount: 4,
    charmPoints: 11,
};
export const GEISHA_CARDS = {
    2: { charm: 2, name: '樱', color: '#FFB6C1', value: 2 },
    3: { charm: 3, name: '梅', color: '#DDA0DD', value: 2 },
    4: { charm: 4, name: '兰', color: '#87CEEB', value: 2 },
    5: { charm: 5, name: '竹', color: '#90EE90', value: 3 },
    6: { charm: 6, name: '菊', color: '#FFA500', value: 3 },
    7: { charm: 7, name: '玫瑰', color: '#FF6347', value: 4 },
    8: { charm: 8, name: '百合', color: '#FFD700', value: 5 },
};
export function getGeishaCardByCharm(charm) {
    return GEISHA_CARDS[charm];
}
//# sourceMappingURL=gameRules.js.map