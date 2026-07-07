import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { InviteStore, createSignalingRouter } from '../src/signaling';

const HOST_OFFER = 'HANA-P2P-V1:host-offer-text';
const PLAYER_ANSWER = 'HANA-INVITE-V1:player-answer-text';

test('signaling routes create, read, answer, poll, consume, and delete invites', async () => {
  let now = 10_000;
  const { baseUrl, close } = await startTestServer(new InviteStore(() => now));
  try {
    const createdResponse = await fetch(`${baseUrl}/api/p2p/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: 'ROOM42', hostName: 'Alice', hostOffer: HOST_OFFER }),
    });
    assert.equal(createdResponse.status, 201);
    assert.equal(createdResponse.headers.get('cache-control'), 'no-store');
    const created = await createdResponse.json() as { inviteId: string; roomId: string; expiresAt: number };
    assert.equal(created.roomId, 'ROOM42');

    const readResponse = await fetch(`${baseUrl}/api/p2p/invites/${created.inviteId}`);
    assert.equal(readResponse.status, 200);
    assert.equal(readResponse.headers.get('cache-control'), 'no-store');
    const read = await readResponse.json() as { hostOffer: string; hostName: string; hasAnswer: boolean };
    assert.equal(read.hostOffer, HOST_OFFER);
    assert.equal(read.hostName, 'Alice');
    assert.equal(read.hasAnswer, false);

    const emptyAnswerResponse = await fetch(`${baseUrl}/api/p2p/invites/${created.inviteId}/answer`);
    assert.equal(emptyAnswerResponse.status, 204);
    assert.equal(emptyAnswerResponse.headers.get('cache-control'), 'no-store');

    now = 11_234;
    const submitResponse = await fetch(`${baseUrl}/api/p2p/invites/${created.inviteId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName: 'Bob', answer: PLAYER_ANSWER }),
    });
    assert.equal(submitResponse.status, 201);
    assert.equal(submitResponse.headers.get('cache-control'), 'no-store');

    const duplicateResponse = await fetch(`${baseUrl}/api/p2p/invites/${created.inviteId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName: 'Carol', answer: 'HANA-P2P-V1:another-answer' }),
    });
    assert.equal(duplicateResponse.status, 409);

    const answerResponse = await fetch(`${baseUrl}/api/p2p/invites/${created.inviteId}/answer`);
    assert.equal(answerResponse.status, 200);
    assert.equal(answerResponse.headers.get('cache-control'), 'no-store');
    const answer = await answerResponse.json() as { answer: string; playerName: string; createdAt: number };
    assert.deepEqual(answer, { answer: PLAYER_ANSWER, playerName: 'Bob', createdAt: 11_234 });

    const secondAnswerResponse = await fetch(`${baseUrl}/api/p2p/invites/${created.inviteId}/answer`);
    assert.equal(secondAnswerResponse.status, 404);
    const secondAnswer = await secondAnswerResponse.json() as { error: string };
    assert.equal(secondAnswer.error, 'INVITE_NOT_FOUND');

    const deleteResponse = await fetch(`${baseUrl}/api/p2p/invites/${created.inviteId}`, { method: 'DELETE' });
    assert.equal(deleteResponse.status, 404);
    assert.equal(deleteResponse.headers.get('cache-control'), 'no-store');

    const missingResponse = await fetch(`${baseUrl}/api/p2p/invites/${created.inviteId}`);
    assert.equal(missingResponse.status, 404);
  } finally {
    await close();
  }
});

test('signaling routes rate limit POST invite creation per IP', async () => {
  const { baseUrl, close } = await startTestServer(new InviteStore(() => 20_000));
  try {
    let lastResponse: Response | null = null;
    for (let index = 0; index < 21; index += 1) {
      lastResponse = await fetch(`${baseUrl}/api/p2p/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: `ROOM${index}`, hostName: 'Alice', hostOffer: HOST_OFFER }),
      });
    }

    assert.ok(lastResponse);
    assert.equal(lastResponse.status, 429);
    assert.equal(lastResponse.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await lastResponse.json(), {
      error: 'RATE_LIMITED',
      message: '请求过于频繁，请稍后再试。',
    });
  } finally {
    await close();
  }
});

test('signaling routes return stable code when invite store is full', async () => {
  const { baseUrl, close } = await startTestServer(new InviteStore(() => 30_000, 10 * 60 * 1000, 0));
  try {
    const response = await fetch(`${baseUrl}/api/p2p/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: 'ROOM42', hostName: 'Alice', hostOffer: HOST_OFFER }),
    });

    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), {
      error: 'INVITE_STORE_FULL',
      message: '当前离线邀请过多，请稍后再试。',
    });
  } finally {
    await close();
  }
});

async function startTestServer(store: InviteStore): Promise<{ baseUrl: string; close(): Promise<void> }> {
  const app = express();
  app.use(express.json({ limit: '300kb' }));
  app.use('/api/p2p', createSignalingRouter(store));
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}
