/**
 * Engine rules - RNG (deterministic, serializable)
 *
 * Requirements:
 * - Same seed => same sequence
 * - No external / implicit global state
 * - Serializable state (uint32)
 */
export type RNG = {
  next(): number;
};

export type RNGState = number;

/**
 * Create initial RNGState from seed.
 * Uses uint32 normalization.
 */
export function createRNGState(seed: number): RNGState {
  return (seed >>> 0) || 0;
}

/**
 * Pure RNG step: (state) => { value, state }
 * Algorithm: mulberry32 (state is uint32)
 */
export function nextRNG(state: RNGState): { value: number; state: RNGState } {
  let a = state >>> 0;
  a = (a + 0x6D2B79F5) >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: a >>> 0 };
}

/**
 * Convenience: create an RNG object from an RNGState.
 * Note: The RNG object is mutable, but you can always serialize back via getRNGState().
 */
export function createRNG(seed: number): RNG {
  let s = createRNGState(seed);
  return {
    next() {
      const n = nextRNG(s);
      s = n.state;
      return n.value;
    },
  };
}

/**
 * Convenience: build an RNG that starts from a known RNGState (for replay).
 */
export function createRNGFromState(initialState: RNGState): RNG {
  let s = initialState >>> 0;
  return {
    next() {
      const n = nextRNG(s);
      s = n.state;
      return n.value;
    },
  };
}

/**
 * Read current internal state from an RNG created by createRNG/createRNGFromState.
 * (Used to persist RNGState into EngineState)
 */
export function getRNGState(rng: RNG): RNGState {
  // We can't access closure state; instead require callers to track state via nextRNG().
  // This helper exists for API completeness but cannot extract closure state.
  // Prefer using RNGState + nextRNG for reducer/init.
  throw new Error('getRNGState is not supported for closure RNG; use RNGState + nextRNG() instead.');
}
