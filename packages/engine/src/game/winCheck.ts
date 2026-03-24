/**
 * Engine - scoring + win check (pure)
 */
import { GameState, GeishaCard, GeishaCharm, PlayerId } from '@hanamikoji/shared';
import { VICTORY_CONDITIONS } from '../rules/geisha';
import { getCharmFromCardId } from '../rules/cards';

export interface ScoreResult {
  p1: { geishaCount: number; totalCharm: number };
  p2: { geishaCount: number; totalCharm: number };
}

export interface VictoryResult {
  winner: PlayerId | null;
  reason: string | null;
}

const PLAYER_IDS: readonly PlayerId[] = ['p1', 'p2'];

function getPlayer(state: GameState, playerId: PlayerId) {
  return state.players[playerId];
}

function getPlayerGeishaItems(geisha: GeishaCard, playerId: PlayerId): string[] {
  return geisha.items[playerId];
}

function deepClone<T>(value: T): T {
  const sc = (globalThis as { structuredClone?: <U>(v: U) => U }).structuredClone;
  if (typeof sc === 'function') return sc(value);

  const seen = new Map<unknown, unknown>();
  const cloneAny = (input: unknown): unknown => {
    if (input === null || typeof input !== 'object') return input;
    if (seen.has(input)) return seen.get(input)!;

    if (Array.isArray(input)) {
      const arr: unknown[] = [];
      seen.set(input, arr);
      for (const item of input) arr.push(cloneAny(item));
      return arr;
    }

    const out: Record<string, unknown> = {};
    seen.set(input, out);
    for (const [key, val] of Object.entries(input as Record<string, unknown>)) out[key] = cloneAny(val);
    return out;
  };

  return cloneAny(value) as T;
}

function clone<T>(value: T): T {
  return deepClone(value);
}

export function applyScoring(state: GameState): { nextState: GameState; score: ScoreResult } {
  const next = clone(state);

  // 在游戏结束时清理 pendingAction，避免卡牌重复计数
  next.pendingAction = null;

  for (const playerId of PLAYER_IDS) {
    const secretCard = getPlayer(next, playerId).secretCard;
    if (!secretCard) continue;
    const charm = getCharmFromCardId(secretCard);
    if (!charm) continue;
    
    // 将密约牌移动到艺伎区域，并从玩家 secretCard 字段中删除
    next.geishas[charm].items[playerId] = [...getPlayerGeishaItems(next.geishas[charm], playerId), secretCard];
    next.players[playerId].secretCard = null;
  }

  let p1GeishaCount = 0;
  let p1TotalCharm = 0;
  let p2GeishaCount = 0;
  let p2TotalCharm = 0;

  for (const geisha of Object.values(next.geishas) as GeishaCard[]) {
    const p1Count = getPlayerGeishaItems(geisha, 'p1').length;
    const p2Count = getPlayerGeishaItems(geisha, 'p2').length;

    if (p1Count > p2Count) {
      geisha.owner = 'p1';
    } else if (p2Count > p1Count) {
      geisha.owner = 'p2';
    }

    if (geisha.owner === 'p1') {
      p1GeishaCount += 1;
      p1TotalCharm += geisha.value;
    } else if (geisha.owner === 'p2') {
      p2GeishaCount += 1;
      p2TotalCharm += geisha.value;
    }
  }

  const score: ScoreResult = {
    p1: { geishaCount: p1GeishaCount, totalCharm: p1TotalCharm },
    p2: { geishaCount: p2GeishaCount, totalCharm: p2TotalCharm },
  };

  getPlayer(next, 'p1').geishaCount = score.p1.geishaCount;
  getPlayer(next, 'p1').totalCharm = score.p1.totalCharm;
  getPlayer(next, 'p2').geishaCount = score.p2.geishaCount;
  getPlayer(next, 'p2').totalCharm = score.p2.totalCharm;

  return { nextState: next, score };
}

export function checkVictory(state: GameState): VictoryResult {
  const p1 = getPlayer(state, 'p1');
  const p2 = getPlayer(state, 'p2');

  const p1Win =
    p1.geishaCount >= VICTORY_CONDITIONS.geishaCount ||
    p1.totalCharm >= VICTORY_CONDITIONS.charmPoints;

  const p2Win =
    p2.geishaCount >= VICTORY_CONDITIONS.geishaCount ||
    p2.totalCharm >= VICTORY_CONDITIONS.charmPoints;

  if (p1Win && !p2Win) {
    return {
      winner: 'p1',
      reason: p1.geishaCount >= VICTORY_CONDITIONS.geishaCount ? '控制4名艺伎获胜' : '累计11点魅力值获胜',
    };
  }

  if (p2Win && !p1Win) {
    return {
      winner: 'p2',
      reason: p2.geishaCount >= VICTORY_CONDITIONS.geishaCount ? '控制4名艺伎获胜' : '累计11点魅力值获胜',
    };
  }

  if (p1Win && p2Win) {
    if (p1.totalCharm > p2.totalCharm) return { winner: 'p1', reason: '魅力值优先' };
    if (p2.totalCharm > p1.totalCharm) return { winner: 'p2', reason: '魅力值优先' };
    if (p1.geishaCount > p2.geishaCount) return { winner: 'p1', reason: '艺伎数量优先' };
    if (p2.geishaCount > p1.geishaCount) return { winner: 'p2', reason: '艺伎数量优先' };
    return { winner: null, reason: '完全平局' };
  }

  return { winner: null, reason: null };
}
