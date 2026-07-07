import type { WebRTCSignalPayload } from './protocol';

const SIGNAL_PREFIX = 'HANA-P2P-V1:';

export function encodeSignalPayload(payload: WebRTCSignalPayload): string {
  return `${SIGNAL_PREFIX}${toBase64Url(JSON.stringify(payload))}`;
}

export function decodeSignalPayload(text: string): WebRTCSignalPayload {
  const trimmed = text.trim();
  if (!trimmed.startsWith(SIGNAL_PREFIX)) {
    throw new Error('信令格式无效：请确认粘贴完整 offer/answer 文本。');
  }
  try {
    const payload = JSON.parse(fromBase64Url(trimmed.slice(SIGNAL_PREFIX.length))) as WebRTCSignalPayload;
    if (!payload || payload.kind !== 'hanamikoji-webrtc-signal' || payload.version !== 1 || !payload.description) {
      throw new Error('invalid payload');
    }
    return payload;
  } catch {
    throw new Error('信令格式无效：无法读取 offer/answer。');
  }
}

function toBase64Url(value: string): string {
  return btoa(unescape(encodeURIComponent(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): string {
  const padded = `${value.replace(/-/g, '+').replace(/_/g, '/')}${'='.repeat((4 - value.length % 4) % 4)}`;
  return decodeURIComponent(escape(atob(padded)));
}
