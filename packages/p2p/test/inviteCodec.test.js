import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import {
  decodeOfflineAnswerPayload,
  decodeOfflineInvitePayload,
  decodeOfflineSignalPayload,
  encodeOfflineAnswerPayload,
  encodeOfflineInvitePayload,
  encodeSignalPayload,
} from '../dist/index.js';

function sampleSignal(role = 'host-offer') {
  return {
    kind: 'hanamikoji-webrtc-signal',
    version: 1,
    role,
    roomId: 'ROOM42',
    hostPeerId: 'host-a',
    remotePeerId: 'guest-b',
    description: { type: role === 'host-offer' ? 'offer' : 'answer', sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n' },
    createdAt: 123456,
  };
}

test('inviteCodec encodes and decodes HANA-INVITE-V1 Host invite via fflate path', async () => {
  const hostOffer = encodeSignalPayload(sampleSignal('host-offer'));
  const payload = {
    kind: 'hanamikoji-offline-invite',
    version: 1,
    mode: 'manual-webrtc',
    roomId: 'ROOM42',
    hostName: 'Alice',
    hostOffer,
    createdAt: 1700000000000,
  };

  const text = await encodeOfflineInvitePayload(payload);
  assert.match(text, /^HANA-INVITE-V1:/);

  const decoded = await decodeOfflineInvitePayload(text);
  assert.deepEqual(decoded, payload);

  const generic = await decodeOfflineSignalPayload(text);
  assert.deepEqual(generic, payload);
});

test('inviteCodec does not require browser CompressionStream globals', async () => {
  const originalCompressionDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'CompressionStream');
  const originalDecompressionDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'DecompressionStream');
  Object.defineProperty(globalThis, 'CompressionStream', { configurable: true, writable: true, value: undefined });
  Object.defineProperty(globalThis, 'DecompressionStream', { configurable: true, writable: true, value: undefined });

  try {
    const payload = {
      kind: 'hanamikoji-offline-invite',
      version: 1,
      mode: 'manual-webrtc',
      roomId: 'ROOM42',
      hostName: 'Alice',
      hostOffer: encodeSignalPayload(sampleSignal('host-offer')),
      createdAt: 1700000002222,
    };

    const text = await encodeOfflineInvitePayload(payload);
    assert.match(text, /^HANA-INVITE-V1:/);
    assert.deepEqual(await decodeOfflineInvitePayload(text), payload);
  } finally {
    if (originalCompressionDescriptor) Object.defineProperty(globalThis, 'CompressionStream', originalCompressionDescriptor);
    else delete globalThis.CompressionStream;
    if (originalDecompressionDescriptor) Object.defineProperty(globalThis, 'DecompressionStream', originalDecompressionDescriptor);
    else delete globalThis.DecompressionStream;
  }
});

test('inviteCodec encodes and decodes compressed Player answer payloads', async () => {
  const playerAnswer = encodeSignalPayload(sampleSignal('player-answer'));
  const payload = {
    kind: 'hanamikoji-offline-answer',
    version: 1,
    mode: 'manual-webrtc',
    roomId: 'ROOM42',
    playerName: 'Bob',
    playerAnswer,
    createdAt: 1700000001111,
  };

  const text = await encodeOfflineAnswerPayload(payload);
  assert.match(text, /^HANA-INVITE-V1:/);

  const decoded = await decodeOfflineAnswerPayload(text);
  assert.deepEqual(decoded, payload);
});

test('inviteCodec decodes older HANA-INVITE-V1 zlib-wrapped payloads', async () => {
  const payload = {
    kind: 'hanamikoji-offline-answer',
    version: 1,
    mode: 'manual-webrtc',
    roomId: 'ROOM42',
    playerName: 'Bob',
    playerAnswer: encodeSignalPayload(sampleSignal('player-answer')),
    createdAt: 1700000003333,
  };
  const compressed = deflateSync(Buffer.from(JSON.stringify(payload), 'utf8'));
  const text = `HANA-INVITE-V1:${compressed.toString('base64url')}`;

  assert.deepEqual(await decodeOfflineAnswerPayload(text), payload);
});

test('inviteCodec remains compatible with legacy HANA-P2P-V1 signal text', async () => {
  const legacy = sampleSignal('host-offer');
  const text = encodeSignalPayload(legacy);

  const decoded = await decodeOfflineSignalPayload(text);
  assert.deepEqual(decoded, legacy);
});

test('Host invite payload contains roomId, hostName, and hostOffer', async () => {
  const hostOffer = encodeSignalPayload(sampleSignal('host-offer'));
  const text = await encodeOfflineInvitePayload({
    kind: 'hanamikoji-offline-invite',
    version: 1,
    mode: 'manual-webrtc',
    roomId: 'ROOM42',
    hostName: 'Alice',
    hostOffer,
    createdAt: 1,
  });

  const decoded = await decodeOfflineInvitePayload(text);
  assert.equal(decoded.roomId, 'ROOM42');
  assert.equal(decoded.hostName, 'Alice');
  assert.equal(decoded.hostOffer, hostOffer);
});
