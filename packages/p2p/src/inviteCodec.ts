import { decompressSync, strFromU8, strToU8, zlibSync } from 'fflate';
import type { WebRTCSignalPayload } from './protocol';
import { decodeSignalPayload } from './signalCodec';

export const OFFLINE_INVITE_PREFIX = 'HANA-INVITE-V1:';

export interface OfflineInvitePayload {
  kind: 'hanamikoji-offline-invite';
  version: 1;
  mode: 'manual-webrtc';
  roomId: string;
  hostName: string;
  hostOffer: string;
  createdAt: number;
}

export interface OfflineAnswerPayload {
  kind: 'hanamikoji-offline-answer';
  version: 1;
  mode: 'manual-webrtc';
  roomId: string;
  playerName: string;
  playerAnswer: string;
  createdAt: number;
}

export type OfflineInviteSignalPayload = OfflineInvitePayload | OfflineAnswerPayload;
export type DecodedOfflineSignalPayload = OfflineInviteSignalPayload | WebRTCSignalPayload;

export function isOfflineInviteText(text: string): boolean {
  return text.trim().startsWith(OFFLINE_INVITE_PREFIX);
}

export function isLegacySignalText(text: string): boolean {
  return text.trim().startsWith('HANA-P2P-V1:');
}

export async function encodeOfflineInvitePayload(payload: OfflineInvitePayload): Promise<string> {
  validateInvitePayload(payload);
  return encodeCompressedPayload(payload);
}

export async function encodeOfflineAnswerPayload(payload: OfflineAnswerPayload): Promise<string> {
  validateAnswerPayload(payload);
  return encodeCompressedPayload(payload);
}

export async function decodeOfflineInvitePayload(text: string): Promise<OfflineInvitePayload> {
  const payload = await decodeCompressedPayload(text);
  validateInvitePayload(payload);
  return payload;
}

export async function decodeOfflineAnswerPayload(text: string): Promise<OfflineAnswerPayload> {
  const payload = await decodeCompressedPayload(text);
  validateAnswerPayload(payload);
  return payload;
}

export async function decodeOfflineSignalPayload(text: string): Promise<DecodedOfflineSignalPayload> {
  const trimmed = text.trim();
  if (isLegacySignalText(trimmed)) return decodeSignalPayload(trimmed);

  const payload = await decodeCompressedPayload(trimmed);
  if (isOfflineInvitePayload(payload)) {
    validateInvitePayload(payload);
    return payload;
  }
  if (isOfflineAnswerPayload(payload)) {
    validateAnswerPayload(payload);
    return payload;
  }
  throw new Error('离线邀请格式无效：无法识别 invite/answer 类型。');
}

async function encodeCompressedPayload(payload: OfflineInviteSignalPayload): Promise<string> {
  const json = JSON.stringify(payload);
  const compressed = await deflateUtf8(json);
  return `${OFFLINE_INVITE_PREFIX}${toBase64Url(compressed)}`;
}

async function decodeCompressedPayload(text: string): Promise<OfflineInviteSignalPayload> {
  const trimmed = text.trim();
  if (!trimmed.startsWith(OFFLINE_INVITE_PREFIX)) {
    throw new Error('离线邀请格式无效：请确认文本以 HANA-INVITE-V1 开头。');
  }
  try {
    const compressed = fromBase64Url(trimmed.slice(OFFLINE_INVITE_PREFIX.length));
    const json = await inflateUtf8(compressed);
    return JSON.parse(json) as OfflineInviteSignalPayload;
  } catch {
    throw new Error('离线邀请格式无效：无法解压或读取内容。');
  }
}

async function deflateUtf8(value: string): Promise<Uint8Array> {
  // Use fflate as the single stable browser/test compression path. zlibSync
  // produces zlib-wrapped DEFLATE, matching the previous CompressionStream('deflate')
  // and node:zlib.deflateSync payloads used inside the HANA-INVITE-V1 envelope.
  return zlibSync(strToU8(value));
}

async function inflateUtf8(value: Uint8Array): Promise<string> {
  // fflate's decompressSync auto-detects raw DEFLATE, zlib, and gzip, so it can
  // read newly encoded payloads and older HANA-INVITE-V1 values from Phase 6/7.
  return strFromU8(decompressSync(value));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = `${normalized}${'='.repeat((4 - normalized.length % 4) % 4)}`;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function validateInvitePayload(payload: unknown): asserts payload is OfflineInvitePayload {
  if (!isOfflineInvitePayload(payload) || !payload.roomId || !payload.hostName || !payload.hostOffer) {
    throw new Error('离线邀请格式无效：invite 缺少 roomId、hostName 或 hostOffer。');
  }
}

function validateAnswerPayload(payload: unknown): asserts payload is OfflineAnswerPayload {
  if (!isOfflineAnswerPayload(payload) || !payload.roomId || !payload.playerName || !payload.playerAnswer) {
    throw new Error('离线回答格式无效：answer 缺少 roomId、playerName 或 playerAnswer。');
  }
}

function isOfflineInvitePayload(payload: unknown): payload is OfflineInvitePayload {
  const candidate = payload as Partial<OfflineInvitePayload> | null;
  return Boolean(candidate)
    && candidate?.kind === 'hanamikoji-offline-invite'
    && candidate.version === 1
    && candidate.mode === 'manual-webrtc';
}

function isOfflineAnswerPayload(payload: unknown): payload is OfflineAnswerPayload {
  const candidate = payload as Partial<OfflineAnswerPayload> | null;
  return Boolean(candidate)
    && candidate?.kind === 'hanamikoji-offline-answer'
    && candidate.version === 1
    && candidate.mode === 'manual-webrtc';
}
