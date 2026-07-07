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
export declare function createRNGState(seed: number): RNGState;
/**
 * Pure RNG step: (state) => { value, state }
 * Algorithm: mulberry32 (state is uint32)
 */
export declare function nextRNG(state: RNGState): {
    value: number;
    state: RNGState;
};
/**
 * Convenience: create an RNG object from an RNGState.
 * Note: The RNG object is mutable, but you can always serialize back via getRNGState().
 */
export declare function createRNG(seed: number): RNG;
/**
 * Convenience: build an RNG that starts from a known RNGState (for replay).
 */
export declare function createRNGFromState(initialState: RNGState): RNG;
/**
 * Read current internal state from an RNG created by createRNG/createRNGFromState.
 * (Used to persist RNGState into EngineState)
 */
export declare function getRNGState(rng: RNG): RNGState;
//# sourceMappingURL=rng.d.ts.map