import test from 'node:test';
import assert from 'node:assert/strict';
import { getInitialLobbyMode, getOnlineBackendNotice, getRequestedLobbyModeFromSearch } from '../src/pages/lobbyMode';

test('Lobby defaults to offline P2P for production deployment even when backend is configured', () => {
  assert.equal(getInitialLobbyMode({ isProduction: true, hasExplicitBackend: true, hasOfflineHash: false }), 'offline-p2p');
});

test('Lobby defaults to offline P2P for production frontend-only deployment', () => {
  assert.equal(getInitialLobbyMode({ isProduction: true, hasExplicitBackend: false, hasOfflineHash: false }), 'offline-p2p');
});

test('Explicit URL mode can still open online server mode', () => {
  assert.equal(getInitialLobbyMode({ isProduction: true, hasExplicitBackend: true, hasOfflineHash: false, requestedMode: 'online' }), 'online');
});

test('Offline invite URL hash always opens offline P2P mode', () => {
  assert.equal(getInitialLobbyMode({ isProduction: false, hasExplicitBackend: true, hasOfflineHash: true, requestedMode: 'online' }), 'offline-p2p');
});

test('URL search parser supports mode aliases', () => {
  assert.equal(getRequestedLobbyModeFromSearch('?mode=p2p'), 'offline-p2p');
  assert.equal(getRequestedLobbyModeFromSearch('?mode=backend'), 'online');
  assert.equal(getRequestedLobbyModeFromSearch('?offline=1'), 'offline-p2p');
  assert.equal(getRequestedLobbyModeFromSearch('?online=true'), 'online');
  assert.equal(getRequestedLobbyModeFromSearch('?room=ABC123'), null);
});

test('Online backend notice explains frontend-only deployment', () => {
  const message = getOnlineBackendNotice({ isProduction: true, hasExplicitBackend: false, isConnected: false });

  assert.match(message ?? '', /没有配置 VITE_SOCKET_URL/);
  assert.match(message ?? '', /离线 P2P/);
  assert.match(message ?? '', /relay 一次扫码不可用/);
});
