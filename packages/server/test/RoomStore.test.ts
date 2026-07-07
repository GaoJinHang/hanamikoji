import test from 'node:test';
import assert from 'node:assert/strict';
import type { GameState, PlayerId, RoomPlayer } from '@hanamikoji/shared';
import type { GameRoom } from '../src/game/GameRoom';
import { RoomStore } from '../src/game/RoomStore';

function player(socketId: string, playerId: PlayerId, name: string): RoomPlayer {
  return { socketId, playerId, name };
}

function gameWithPhase(phase: GameState['phase'], connected = { p1: true, p2: true }): GameRoom {
  return {
    getState: () => ({
      phase,
      players: {
        p1: { connected: connected.p1 },
        p2: { connected: connected.p2 },
      },
    }),
  } as unknown as GameRoom;
}

test('join creates reconnect tokens and resume requires the matching token', () => {
  const store = new RoomStore();
  const created = store.createRoom(player('s1', 'p1', 'Alice'));
  const joined = store.join('s2', 'Bob', created.roomId);

  assert.equal(joined.success, true);
  if (!joined.success) return;
  assert.equal(joined.player.playerId, 'p2');
  assert.match(joined.reconnectToken, /^[a-f0-9]{64}$/);

  assert.equal(store.resume(created.roomId, 'p2', 'bad-token', 's3'), undefined);

  const resumed = store.resume(created.roomId, 'p2', joined.reconnectToken, 's3');
  assert.ok(resumed);
  assert.equal(resumed?.players.p2?.socketId, 's3');
});

test('cleanup removes stale waiting rooms', () => {
  let now = 0;
  const store = new RoomStore({ waitingRoomTtlMs: 100, now: () => now });
  const created = store.createRoom(player('s1', 'p1', 'Alice'));

  now = 99;
  assert.deepEqual(store.cleanupExpiredRooms(), []);
  assert.equal(store.get(created.roomId)?.roomId, created.roomId);

  now = 100;
  const removed = store.cleanupExpiredRooms();
  assert.deepEqual(removed, [{ roomId: created.roomId, reason: 'waiting_expired' }]);
  assert.equal(store.get(created.roomId), undefined);
});

test('cleanup removes finished and fully disconnected games after their TTL', () => {
  let now = 0;
  const store = new RoomStore({ finishedRoomTtlMs: 100, disconnectedRoomTtlMs: 200, now: () => now });

  const finished = store.createRoom(player('s1', 'p1', 'Alice'));
  const disconnected = store.createRoom(player('s2', 'p1', 'Carol'));
  store.setGame(finished.roomId, gameWithPhase('game_over'));
  store.setGame(disconnected.roomId, gameWithPhase('p1_draw', { p1: false, p2: false }));

  now = 100;
  assert.deepEqual(store.cleanupExpiredRooms(), [{ roomId: finished.roomId, reason: 'finished_expired' }]);
  assert.ok(store.get(disconnected.roomId));

  now = 200;
  assert.deepEqual(store.cleanupExpiredRooms(), [{ roomId: disconnected.roomId, reason: 'disconnected_expired' }]);
});
