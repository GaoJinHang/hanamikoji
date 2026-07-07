import type { GameState, PlayerState } from '@hanamikoji/shared';
import type { EngineState } from '@hanamikoji/engine';

function sortRecord(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortRecord);
  if (value === null || typeof value !== 'object') return value;

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) {
    const item = input[key];
    if (item === undefined) continue;
    output[key] = sortRecord(item);
  }
  return output;
}

function stripTransientPlayerFields(player: PlayerState): PlayerState {
  const { socketId: _socketId, connected: _connected, ...rest } = player;
  return {
    ...rest,
    connected: true,
  };
}

export function normalizeGameStateForHash(state: GameState): GameState {
  return {
    ...state,
    players: {
      p1: stripTransientPlayerFields(state.players.p1),
      p2: stripTransientPlayerFields(state.players.p2),
    },
  };
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortRecord(value));
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function hashGameState(state: GameState): string {
  return `view:${fnv1a(stableStringify(normalizeGameStateForHash(state)))}`;
}

export function hashEngineState(state: EngineState): string {
  return `engine:${fnv1a(stableStringify({
    ...state,
    gameState: normalizeGameStateForHash(state.gameState),
  }))}`;
}
