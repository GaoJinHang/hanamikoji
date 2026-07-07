import test from 'node:test';
import assert from 'node:assert/strict';
import { getInitialLobbyMode, getOnlineBackendNotice } from '../src/pages/lobbyMode';

test('Lobby defaults to offline P2P for production frontend-only deployment', () => {
  assert.equal(getInitialLobbyMode({ isProduction: true, hasExplicitBackend: false, hasOfflineHash: false }), 'offline-p2p');
});

test('Lobby keeps online default when a backend is explicitly configured', () => {
  assert.equal(getInitialLobbyMode({ isProduction: true, hasExplicitBackend: true, hasOfflineHash: false }), 'online');
});

test('Offline invite URL hash always opens offline P2P mode', () => {
  assert.equal(getInitialLobbyMode({ isProduction: false, hasExplicitBackend: true, hasOfflineHash: true }), 'offline-p2p');
});

test('Online backend notice explains frontend-only deployment', () => {
  const message = getOnlineBackendNotice({ isProduction: true, hasExplicitBackend: false, isConnected: false });

  assert.match(message ?? '', /没有配置 VITE_SOCKET_URL/);
  assert.match(message ?? '', /离线 P2P/);
  assert.match(message ?? '', /relay 一次扫码不可用/);
});
