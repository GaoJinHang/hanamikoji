import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ClientRuntime,
  HostRuntime,
  MemoryTransport,
  hashEngineState,
  makeBase,
} from '../dist/index.js';

function createLobbyHarness(seed = 42) {
  const transport = new MemoryTransport();
  const hostEndpoint = transport.createEndpoint('host');
  const p1Endpoint = transport.createEndpoint('peer-p1');
  const p2Endpoint = transport.createEndpoint('peer-p2');
  const p1Messages = [];
  const p2Messages = [];
  p1Endpoint.onMessage(envelope => p1Messages.push(envelope));
  p2Endpoint.onMessage(envelope => p2Messages.push(envelope));

  const host = new HostRuntime({ endpoint: hostEndpoint, roomId: 'P2P001', seed, firstPlayer: 'p1' });
  const p1 = new ClientRuntime({ endpoint: p1Endpoint, hostPeerId: 'host', playerName: 'Alice' });
  const p2 = new ClientRuntime({ endpoint: p2Endpoint, hostPeerId: 'host', playerName: 'Bob' });

  p1.join();
  p2.join();

  assert.equal(p1.playerId, 'p1');
  assert.equal(p2.playerId, 'p2');

  return { transport, hostEndpoint, p1Endpoint, p2Endpoint, host, p1, p2, p1Messages, p2Messages };
}

function createStartedHarness(seed = 42) {
  const harness = createLobbyHarness(seed);
  harness.p1.setLobbyReady(true);
  harness.p2.setLobbyReady(true);
  harness.p1.requestStartGame();

  assert.ok(harness.host.getAuthoritativeState());
  assert.ok(harness.p1.gameState);
  assert.ok(harness.p2.gameState);

  return harness;
}

function lastMessage(messages, type) {
  const found = messages.map(item => item.message).filter(message => message.type === type).at(-1);
  assert.ok(found, `expected message ${type}`);
  return found;
}

function hiddenOnly(hand) {
  return hand.every(cardId => cardId.startsWith('__hidden_card_'));
}

test('two joined players do not auto-start the HostRuntime game', () => {
  const { host, p1, p2 } = createLobbyHarness(1000);

  assert.equal(host.getAuthoritativeState(), null);
  assert.equal(host.getStateVersion(), 0);
  assert.equal(host.getEventLog().length, 0);
  assert.equal(p1.gameState, null);
  assert.equal(p2.gameState, null);
  assert.equal(p1.viewHash, null);
  assert.equal(p2.viewHash, null);
});

test('two joined players receive LOBBY_STATE broadcasts', () => {
  const { host, p1, p2, p1Messages, p2Messages } = createLobbyHarness(1002);
  const p1Lobby = lastMessage(p1Messages, 'LOBBY_STATE');
  const p2Lobby = lastMessage(p2Messages, 'LOBBY_STATE');

  assert.equal(p1Lobby.roomId, 'P2P001');
  assert.equal(p2Lobby.roomId, 'P2P001');
  assert.equal(p1Lobby.players.length, 2);
  assert.equal(p2Lobby.players.length, 2);
  assert.deepEqual(p1Lobby.ready, { p1: false, p2: false });
  assert.deepEqual(p2Lobby.ready, { p1: false, p2: false });
  assert.equal(p1Lobby.canStart, false);
  assert.equal(p2Lobby.canStart, false);
  assert.equal(p1Lobby.hostPlayerId, 'p1');
  assert.equal(p2Lobby.hostPlayerId, 'p1');
  assert.deepEqual(p1.lobbyState, p1Lobby);
  assert.deepEqual(p2.lobbyState, p2Lobby);
  assert.deepEqual(host.getLobbyState().ready, { p1: false, p2: false });
});

test('START_GAME_REQUEST is rejected while only one player is Ready', () => {
  const { host, p1 } = createLobbyHarness(1003);
  let rejected = null;
  p1.on('startGameRejected', message => { rejected = message; });

  p1.setLobbyReady(true);
  p1.requestStartGame();

  assert.ok(rejected);
  assert.match(rejected.reason, /Ready/);
  assert.equal(host.getAuthoritativeState(), null);
  assert.equal(host.getEventLog().length, 0);
});

test('both Ready players can start only when the Host player requests start', () => {
  const { host, p1, p2, p1Messages, p2Messages } = createLobbyHarness(1004);
  let p1GameStarted = null;
  let p2GameStarted = null;
  p1.on('gameStarted', message => { p1GameStarted = message; });
  p2.on('gameStarted', message => { p2GameStarted = message; });

  p1.setLobbyReady(true);
  p2.setLobbyReady(true);

  assert.equal(host.getAuthoritativeState(), null);
  assert.equal(p1.lobbyState.canStart, true);
  assert.equal(p2.lobbyState.canStart, true);

  p1.requestStartGame();

  const authoritative = host.getAuthoritativeState();
  assert.ok(authoritative);
  assert.ok(p1GameStarted);
  assert.ok(p2GameStarted);
  assert.equal(p1.gameState.roomId, 'P2P001');
  assert.equal(p2.gameState.roomId, 'P2P001');
  assert.equal(lastMessage(p1Messages, 'GAME_START').playerId, 'p1');
  assert.equal(lastMessage(p2Messages, 'GAME_START').playerId, 'p2');
});

test('non-Host player START_GAME_REQUEST is rejected', () => {
  const { host, p1, p2 } = createLobbyHarness(1005);
  let rejected = null;
  p2.on('startGameRejected', message => { rejected = message; });

  p1.setLobbyReady(true);
  p2.setLobbyReady(true);
  p2.requestStartGame();

  assert.ok(rejected);
  assert.match(rejected.reason, /Host/);
  assert.equal(host.getAuthoritativeState(), null);
  assert.equal(p1.gameState, null);
  assert.equal(p2.gameState, null);
});

test('Ready state is persisted in HostRuntimeSnapshot without adding eventLog entries', () => {
  const { host, p1, p2 } = createLobbyHarness(1006);
  const before = host.getEventLog().length;

  p1.setLobbyReady(true);
  p2.setLobbyReady(true);

  const snapshot = host.getSnapshot();
  assert.equal(host.getEventLog().length, before);
  assert.deepEqual(snapshot.lobbyReady, { p1: true, p2: true });
  assert.equal(snapshot.eventLog.length, before);
  assert.equal(snapshot.hostPlayerId, 'p1');
});

test('game start rejects a third JOIN_REQUEST without reconnectToken', () => {
  const { transport, host } = createStartedHarness(1007);
  const p3Endpoint = transport.createEndpoint('peer-p3');
  const p3 = new ClientRuntime({ endpoint: p3Endpoint, hostPeerId: 'host', playerName: 'Carol' });
  let rejected = null;
  p3.on('joinRejected', message => { rejected = message; });

  p3.join('P2P001');

  assert.ok(host.getAuthoritativeState());
  assert.ok(rejected);
  assert.match(rejected.reason, /游戏已经开始/);
  assert.equal(rejected.canRetry, true);
  assert.equal(p3.playerId, null);
  assert.equal(p3.gameState, null);
});

test('HostRuntime starts a game and sends different masked views to p1 and p2', () => {
  const { host, p1, p2, p1Messages, p2Messages } = createStartedHarness(1001);
  const authoritative = host.getAuthoritativeState();

  assert.ok(authoritative);
  assert.equal(host.getStateVersion(), 0);
  assert.equal(p1.stateVersion, 0);
  assert.equal(p2.stateVersion, 0);
  assert.equal(p1.gameState.roomId, 'P2P001');
  assert.equal(p2.gameState.roomId, 'P2P001');

  assert.equal(lastMessage(p1Messages, 'GAME_START').playerId, 'p1');
  assert.equal(lastMessage(p2Messages, 'GAME_START').playerId, 'p2');
  assert.equal(lastMessage(p1Messages, 'STATE_VIEW').viewHash, p1.viewHash);
  assert.equal(lastMessage(p2Messages, 'STATE_VIEW').viewHash, p2.viewHash);

  assert.deepEqual(p1.gameState.players.p1.hand, authoritative.gameState.players.p1.hand);
  assert.deepEqual(p2.gameState.players.p2.hand, authoritative.gameState.players.p2.hand);
  assert.ok(hiddenOnly(p1.gameState.players.p2.hand));
  assert.ok(hiddenOnly(p2.gameState.players.p1.hand));
  assert.notDeepEqual(p1.gameState.players.p2.hand, authoritative.gameState.players.p2.hand);
  assert.notDeepEqual(p2.gameState.players.p1.hand, authoritative.gameState.players.p1.hand);
});

test('p1 DRAW_CARD is accepted and advances stateVersion', () => {
  const { host, p1, p2 } = createStartedHarness(7);
  const beforeVersion = p1.stateVersion;
  const beforeHand = p1.gameState.players.p1.hand.length;

  p1.sendDrawCard('draw-ok');

  assert.equal(host.getStateVersion(), beforeVersion + 1);
  assert.equal(p1.stateVersion, beforeVersion + 1);
  assert.equal(p2.stateVersion, beforeVersion + 1);
  assert.equal(p1.gameState.players.p1.hand.length, beforeHand + 1);
  assert.equal(host.getEventLog().length, 1);
  assert.equal(host.getEventLog()[0].requestId, 'draw-ok');
});

test('non-current player action is rejected without changing version', () => {
  const { host, p2 } = createStartedHarness(8);
  let rejected = null;
  p2.on('actionRejected', message => { rejected = message; });

  p2.sendDrawCard('p2-too-early');

  assert.ok(rejected);
  assert.equal(rejected.code, 'INVALID_ACTION');
  assert.match(rejected.reason, /不是你的回合/);
  assert.equal(rejected.canSync, false);
  assert.equal(host.getStateVersion(), 0);
  assert.equal(host.getEventLog().length, 0);
});

test('actorId must match the transport connection identity', () => {
  const { host, p2, p2Endpoint } = createStartedHarness(9);
  let rejected = null;
  p2.on('actionRejected', message => { rejected = message; });

  p2Endpoint.send('host', {
    ...makeBase('ACTION_INTENT'),
    requestId: 'spoof-p1',
    actorId: 'p1',
    stateVersion: p2.stateVersion,
    previousViewHash: p2.viewHash,
    intent: { type: 'DRAW_CARD' },
  });

  assert.ok(rejected);
  assert.equal(rejected.code, 'ACTOR_MISMATCH');
  assert.equal(rejected.canSync, false);
  assert.equal(host.getStateVersion(), 0);
});

test('stale stateVersion or previousViewHash is rejected and can be fixed by SYNC', () => {
  const { host, p1 } = createStartedHarness(10);
  const oldVersion = p1.stateVersion;
  const oldViewHash = p1.viewHash;
  let rejected = null;
  let syncResponse = null;

  p1.on('actionRejected', message => { rejected = message; });
  p1.on('stateView', message => {
    if (message.type === 'SYNC_RESPONSE') syncResponse = message;
  });

  p1.sendDrawCard('advance-first');
  assert.equal(host.getStateVersion(), oldVersion + 1);

  p1.endpoint.send('host', {
    ...makeBase('ACTION_INTENT'),
    requestId: 'stale-request',
    actorId: 'p1',
    stateVersion: oldVersion,
    previousViewHash: oldViewHash,
    intent: { type: 'DRAW_CARD' },
  });

  assert.ok(rejected);
  assert.equal(rejected.code, 'STALE_STATE');
  assert.equal(rejected.canSync, true);
  assert.equal(rejected.expectedStateVersion, host.getStateVersion());
  assert.ok(rejected.expectedPreviousViewHash);

  p1.requestSync();

  assert.ok(syncResponse);
  assert.equal(syncResponse.type, 'SYNC_RESPONSE');
  assert.equal(syncResponse.stateVersion, host.getStateVersion());
  assert.equal(p1.stateVersion, host.getStateVersion());
  assert.equal(p1.viewHash, syncResponse.viewHash);
});

test('p1 view never exposes p2 real hand ids or p2 secretCard after game start', () => {
  const { p1, p2 } = createStartedHarness(11);

  p1.sendDrawCard('p1-draw');
  const p1Discard = p1.gameState.players.p1.hand.slice(0, 2);
  p1.sendPlayAction({ type: 'discard', cardIds: p1Discard }, 'p1-discard');

  p2.sendDrawCard('p2-draw');
  const p2Secret = p2.gameState.players.p2.hand[0];
  p2.sendPlayAction({ type: 'secret', cardIds: [p2Secret] }, 'p2-secret');

  assert.ok(hiddenOnly(p1.gameState.players.p2.hand));
  assert.equal(p1.gameState.players.p2.hand.includes(p2Secret), false);
  assert.equal(p1.gameState.players.p2.secretCard, null);
  assert.equal(p2.gameState.players.p2.secretCard, p2Secret);
});

test('eventLog sequence, versions, and authoritative hashes are continuous', () => {
  const { host, p1 } = createStartedHarness(12);
  const initialHash = hashEngineState(host.getAuthoritativeState());

  p1.sendDrawCard('log-draw');
  const cards = p1.gameState.players.p1.hand.slice(0, 2);
  p1.sendPlayAction({ type: 'discard', cardIds: cards }, 'log-discard');

  const log = host.getEventLog();
  assert.equal(log.length, 2);
  assert.equal(log[0].sequence, 1);
  assert.equal(log[0].previousVersion, 0);
  assert.equal(log[0].nextVersion, 1);
  assert.equal(log[0].previousAuthoritativeStateHash, initialHash);
  assert.equal(log[1].sequence, 2);
  assert.equal(log[1].previousVersion, 1);
  assert.equal(log[1].nextVersion, 2);
  assert.equal(log[1].previousAuthoritativeStateHash, log[0].nextAuthoritativeStateHash);
  assert.equal(host.getStateVersion(), 2);
});

test('SYNC_REQUEST returns only the requesting player latest STATE_VIEW payload', () => {
  const { host, p1, p2 } = createStartedHarness(13);
  let p1Sync = null;
  let p2Sync = null;
  p1.on('stateView', message => {
    if (message.type === 'SYNC_RESPONSE') p1Sync = message;
  });
  p2.on('stateView', message => {
    if (message.type === 'SYNC_RESPONSE') p2Sync = message;
  });

  p1.sendDrawCard('sync-draw');
  p1.requestSync();

  assert.ok(p1Sync);
  assert.equal(p1Sync.playerId, 'p1');
  assert.equal(p1Sync.stateVersion, host.getStateVersion());
  assert.equal(p1Sync.viewHash, p1.viewHash);
  assert.equal(p2Sync, null);
  assert.ok(hiddenOnly(p1Sync.state.players.p2.hand));
});

test('HostRuntime snapshot plus reconnectToken restores clients through JOIN_REQUEST', () => {
  const original = createStartedHarness(21);
  original.p1.sendDrawCard('snapshot-draw');
  const snapshot = original.host.getSnapshot();

  const transport = new MemoryTransport();
  const hostEndpoint = transport.createEndpoint('host-restored');
  const p1Endpoint = transport.createEndpoint('peer-p1-restored');
  const p2Endpoint = transport.createEndpoint('peer-p2-restored');
  const restoredHost = new HostRuntime({ endpoint: hostEndpoint, snapshot });
  const restoredP1 = new ClientRuntime({
    endpoint: p1Endpoint,
    hostPeerId: 'host-restored',
    playerName: 'Alice',
    resume: {
      playerId: 'p1',
      reconnectToken: original.p1.reconnectToken,
      stateVersion: original.p1.stateVersion,
      viewHash: original.p1.viewHash,
    },
  });
  const restoredP2 = new ClientRuntime({
    endpoint: p2Endpoint,
    hostPeerId: 'host-restored',
    playerName: 'Bob',
    resume: {
      playerId: 'p2',
      reconnectToken: original.p2.reconnectToken,
      stateVersion: original.p2.stateVersion,
      viewHash: original.p2.viewHash,
    },
  });

  restoredP1.join(snapshot.roomId);
  restoredP2.join(snapshot.roomId);

  assert.equal(restoredHost.getStateVersion(), original.host.getStateVersion());
  assert.equal(restoredP1.stateVersion, original.host.getStateVersion());
  assert.equal(restoredP2.stateVersion, original.host.getStateVersion());
  assert.equal(restoredP1.playerId, 'p1');
  assert.equal(restoredP2.playerId, 'p2');
  assert.ok(hiddenOnly(restoredP1.gameState.players.p2.hand));
});
