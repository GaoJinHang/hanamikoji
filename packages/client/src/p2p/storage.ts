import type { HostRuntimeSnapshot } from '@hanamikoji/p2p';
import type { PlayerId } from '@hanamikoji/shared';

const HOST_KEY = 'hanamikoji_offline_host_snapshot_v1';
const CLIENT_KEY = 'hanamikoji_offline_client_session_v1';

export type OfflineP2PRole = 'host' | 'player';

export interface OfflineClientSessionSnapshot {
  role: OfflineP2PRole;
  roomId: string;
  playerId: PlayerId;
  reconnectToken: string;
  lastStateVersion: number;
  lastViewHash: string | null;
  updatedAt: number;
}

export interface StoredHostSnapshot {
  snapshot: HostRuntimeSnapshot;
  updatedAt: number;
}

export function saveHostSnapshot(snapshot: HostRuntimeSnapshot): void {
  safeSet(HOST_KEY, { snapshot, updatedAt: Date.now() });
}

export function loadHostSnapshot(): HostRuntimeSnapshot | null {
  const stored = safeGet<StoredHostSnapshot>(HOST_KEY);
  return stored?.snapshot ?? null;
}

export function clearHostSnapshot(): void {
  safeRemove(HOST_KEY);
}

export function saveClientSession(session: OfflineClientSessionSnapshot): void {
  safeSet(CLIENT_KEY, { ...session, updatedAt: Date.now() });
}

export function loadClientSession(): OfflineClientSessionSnapshot | null {
  const stored = safeGet<OfflineClientSessionSnapshot>(CLIENT_KEY);
  if (!stored) return null;
  if (stored.role !== 'host' && stored.role !== 'player') return null;
  if (!stored.roomId || !isPlayerId(stored.playerId) || !stored.reconnectToken) return null;
  if (typeof stored.lastStateVersion !== 'number') return null;
  return { ...stored, lastViewHash: stored.lastViewHash ?? null };
}

export function getRestoredOfflineClientSession(): OfflineClientSessionSnapshot | null {
  return loadClientSession();
}

export function clearClientSession(): void {
  safeRemove(CLIENT_KEY);
}

function safeSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Offline recovery is best effort; gameplay can continue in memory.
  }
}

function safeGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore unavailable storage.
  }
}

function isPlayerId(value: unknown): value is PlayerId {
  return value === 'p1' || value === 'p2';
}
