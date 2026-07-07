import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOfflineRelayJoinHash, parseOfflineHash } from '../src/p2p/inviteUrl';
import {
  SignalingRelayError,
  buildApiUrl,
  createRelayInviteOrFallback,
  getInvite,
  startAnswerPolling,
} from '../src/p2p/signalingClient';

test('signalingClient builds API URLs with configured base URL', () => {
  assert.equal(buildApiUrl('/api/p2p/invites', 'https://api.example.com'), 'https://api.example.com/api/p2p/invites');
  assert.equal(buildApiUrl('api/p2p/invites', 'https://api.example.com/'), 'https://api.example.com/api/p2p/invites');
  assert.equal(buildApiUrl('/api/p2p/invites', ''), '/api/p2p/invites');
});

test('inviteUrl parses #/offline/join?invite= relay hashes', () => {
  const parsed = parseOfflineHash(buildOfflineRelayJoinHash('ABCD12relay'));
  assert.deepEqual(parsed, { kind: 'join', inviteId: 'ABCD12relay', source: 'relay-invite' });
});

test('signalingClient preserves structured relay error code and status', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'INVITE_NOT_FOUND', message: 'invite 不存在或已过期。' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });

  try {
    await assert.rejects(
      () => getInvite('missing'),
      (error: unknown) => {
        assert.ok(error instanceof SignalingRelayError);
        assert.equal(error.status, 404);
        assert.equal(error.code, 'INVITE_NOT_FOUND');
        assert.equal(error.message, 'invite 不存在或已过期。');
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('relay invite creation failure falls back to pure offline join URL', async () => {
  const result = await createRelayInviteOrFallback(
    { roomId: 'ROOM42', hostName: 'Alice', hostOffer: 'HANA-P2P-V1:offer' },
    'https://game.example/#/offline/join?signal=long-invite',
    async () => { throw new Error('relay offline'); },
  );

  assert.equal(result.relay, null);
  assert.equal(result.joinUrl, 'https://game.example/#/offline/join?signal=long-invite');
  assert.equal(result.error?.message, 'relay offline');
});

test('404 INVITE_NOT_FOUND stops answer polling and reports expiration once', async () => {
  let polls = 0;
  let expiredCalls = 0;
  let errors = 0;

  startAnswerPolling('relay-expired', {
    intervalMs: 5,
    async pollAnswerFn() {
      polls += 1;
      throw new SignalingRelayError(404, 'INVITE_NOT_FOUND', 'invite 不存在或已过期。');
    },
    async applyAnswer() {
      throw new Error('applyAnswer should not run');
    },
    onExpired(error) {
      expiredCalls += 1;
      assert.equal(error.message, '邀请已过期，请重新创建房间。');
      assert.equal(error.code, 'INVITE_NOT_FOUND');
    },
    onError() {
      errors += 1;
    },
  });

  await wait(35);
  assert.equal(polls, 1);
  assert.equal(expiredCalls, 1);
  assert.equal(errors, 0);
});

test('answer polling suppresses repeated identical transient errors', async () => {
  let polls = 0;
  let errors = 0;
  const controller = startAnswerPolling('relay-flaky', {
    intervalMs: 5,
    async pollAnswerFn() {
      polls += 1;
      throw new TypeError('network down');
    },
    async applyAnswer() {
      throw new Error('applyAnswer should not run');
    },
    onError(error) {
      errors += 1;
      assert.equal(error.message, 'network down');
    },
  });

  await wait(45);
  controller.stop();
  assert.ok(polls > 3);
  assert.equal(errors, 3);
});

test('answer polling stops after applying relay answer and tolerates deleteInvite 404', async () => {
  let polls = 0;
  let applied: string | null = null;
  let deleted = false;
  let errors = 0;

  const done = new Promise<void>((resolve, reject) => {
    startAnswerPolling('relay-1', {
      intervalMs: 5,
      async pollAnswerFn() {
        polls += 1;
        if (polls < 2) return null;
        return { answer: 'HANA-INVITE-V1:answer', playerName: 'Bob', createdAt: 123 };
      },
      async applyAnswer(answer) {
        applied = answer;
      },
      async deleteInviteFn(inviteId) {
        deleted = inviteId === 'relay-1';
        throw new SignalingRelayError(404, 'INVITE_NOT_FOUND', 'invite 不存在或已过期。');
      },
      onError(error) {
        errors += 1;
        reject(error);
      },
    });
    setTimeout(resolve, 25);
  });

  await done;
  assert.equal(applied, 'HANA-INVITE-V1:answer');
  assert.equal(deleted, true);
  assert.equal(errors, 0);
  const pollsAfterStop = polls;
  await wait(20);
  assert.equal(polls, pollsAfterStop);
});

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
