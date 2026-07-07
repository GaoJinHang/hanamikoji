export function createPlayers() {
  return {
    p1: { socketId: 's1', playerId: 'p1', name: 'P1' },
    p2: { socketId: 's2', playerId: 'p2', name: 'P2' },
  };
}

export function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleWithRng(items, rng) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function choose(items, rng) {
  if (items.length === 0) throw new Error('Cannot choose from an empty array');
  return items[Math.floor(rng() * items.length)];
}
