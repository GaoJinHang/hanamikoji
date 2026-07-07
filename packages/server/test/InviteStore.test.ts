import test from 'node:test';
import assert from 'node:assert/strict';
import {
  InviteAnswerAlreadySubmittedError,
  InvitePayloadTooLargeError,
  InviteStore,
  InviteStoreFullError,
  MAX_SIGNAL_TEXT_LENGTH,
} from '../src/signaling/InviteStore';

const HOST_OFFER = 'HANA-P2P-V1:host-offer-text';
const PLAYER_ANSWER = 'HANA-INVITE-V1:player-answer-text';

test('InviteStore creates and reads a signaling invite', () => {
  let now = 1_000;
  const store = new InviteStore(() => now);
  const created = store.create({ roomId: 'ROOM42', hostName: 'Alice', hostOffer: HOST_OFFER });

  assert.ok(created.inviteId.length >= 12);
  assert.equal(created.roomId, 'ROOM42');
  assert.equal(created.hostName, 'Alice');
  assert.equal(created.hostOffer, HOST_OFFER);
  assert.equal(created.createdAt, now);
  assert.equal(created.expiresAt, now + 10 * 60 * 1000);

  const read = store.get(created.inviteId);
  assert.deepEqual(read, created);
});

test('InviteStore records answerCreatedAt as the answer submit time', () => {
  let now = 2_000;
  const store = new InviteStore(() => now);
  const created = store.create({ roomId: 'ROOM42', hostName: 'Alice', hostOffer: HOST_OFFER });

  now = 2_345;
  const updated = store.submitAnswer(created.inviteId, { playerName: 'Bob', answer: PLAYER_ANSWER });
  assert.equal(updated?.answer, PLAYER_ANSWER);
  assert.equal(updated?.playerName, 'Bob');
  assert.equal(updated?.answerCreatedAt, 2_345);

  const answer = store.getAnswer(created.inviteId);
  assert.deepEqual(answer, { answer: PLAYER_ANSWER, playerName: 'Bob', createdAt: 2_345 });
});

test('InviteStore consumes invite after Host reads answer', () => {
  let now = 2_000;
  const store = new InviteStore(() => now);
  const created = store.create({ roomId: 'ROOM42', hostName: 'Alice', hostOffer: HOST_OFFER });

  now = 2_100;
  store.submitAnswer(created.inviteId, { playerName: 'Bob', answer: PLAYER_ANSWER });
  assert.deepEqual(store.getAnswer(created.inviteId), { answer: PLAYER_ANSWER, playerName: 'Bob', createdAt: 2_100 });
  assert.equal(store.get(created.inviteId), null);
  assert.equal(store.getAnswer(created.inviteId), null);
  assert.equal(store.delete(created.inviteId), false);
});

test('InviteStore rejects duplicate Player answers', () => {
  const store = new InviteStore(() => 3_000);
  const created = store.create({ roomId: 'ROOM42', hostName: 'Alice', hostOffer: HOST_OFFER });
  store.submitAnswer(created.inviteId, { playerName: 'Bob', answer: PLAYER_ANSWER });

  assert.throws(
    () => store.submitAnswer(created.inviteId, { playerName: 'Carol', answer: 'HANA-P2P-V1:another-answer' }),
    InviteAnswerAlreadySubmittedError,
  );
});

test('InviteStore rejects creation when capacity is full', () => {
  let now = 4_000;
  const store = new InviteStore(() => now, 10 * 60 * 1000, 1);
  store.create({ roomId: 'ROOM42', hostName: 'Alice', hostOffer: HOST_OFFER });

  assert.throws(
    () => store.create({ roomId: 'ROOM43', hostName: 'Carol', hostOffer: HOST_OFFER }),
    InviteStoreFullError,
  );

  now += 10 * 60 * 1000 + 1;
  assert.doesNotThrow(() => store.create({ roomId: 'ROOM43', hostName: 'Carol', hostOffer: HOST_OFFER }));
});

test('InviteStore rejects signal text above the MVP size limit', () => {
  const store = new InviteStore(() => 4_500);
  const tooLongSignal = `HANA-P2P-V1:${'x'.repeat(MAX_SIGNAL_TEXT_LENGTH)}`;

  assert.throws(
    () => store.create({ roomId: 'ROOM42', hostName: 'Alice', hostOffer: tooLongSignal }),
    InvitePayloadTooLargeError,
  );
});

test('InviteStore treats expired invites as unreadable', () => {
  let now = 10_000;
  const store = new InviteStore(() => now, 100);
  const created = store.create({ roomId: 'ROOM42', hostName: 'Alice', hostOffer: HOST_OFFER });

  assert.ok(store.get(created.inviteId));
  now += 101;
  assert.equal(store.get(created.inviteId), null);
  assert.equal(store.submitAnswer(created.inviteId, { playerName: 'Bob', answer: PLAYER_ANSWER }), null);
});

test('InviteStore deletes invites', () => {
  const store = new InviteStore(() => 5_000);
  const created = store.create({ roomId: 'ROOM42', hostName: 'Alice', hostOffer: HOST_OFFER });

  assert.equal(store.delete(created.inviteId), true);
  assert.equal(store.get(created.inviteId), null);
  assert.equal(store.delete(created.inviteId), false);
});

test('InviteStore records do not contain game state, event log, or hand fields', () => {
  const store = new InviteStore(() => 6_000);
  const created = store.create({ roomId: 'ROOM42', hostName: 'Alice', hostOffer: HOST_OFFER });
  store.submitAnswer(created.inviteId, { playerName: 'Bob', answer: PLAYER_ANSWER });
  const [record] = store.snapshotForTest();
  const json = JSON.stringify(record);

  assert.equal('gameState' in record, false);
  assert.equal('engineState' in record, false);
  assert.equal('eventLog' in record, false);
  assert.equal('hand' in record, false);
  assert.doesNotMatch(json, /EngineState|eventLog|hand|cards/);
});
