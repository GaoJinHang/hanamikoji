export type OfflineHashRoute =
  | { kind: 'join'; signalText: string; source: 'signal' | 'legacy-offer' }
  | { kind: 'join'; inviteId: string; source: 'relay-invite' }
  | { kind: 'answer'; signalText: string; source: 'signal' | 'legacy-offer' }
  | null;

export function buildOfflineJoinHash(signalText: string): string {
  return `#/offline/join?signal=${encodeURIComponent(signalText)}`;
}

export function buildOfflineRelayJoinHash(inviteId: string): string {
  return `#/offline/join?invite=${encodeURIComponent(inviteId)}`;
}

export function buildOfflineAnswerHash(signalText: string): string {
  return `#/offline/answer?signal=${encodeURIComponent(signalText)}`;
}

export function buildOfflineJoinUrl(signalText: string, baseUrl = currentBaseUrl()): string {
  return `${baseUrl}${buildOfflineJoinHash(signalText)}`;
}

export function buildOfflineRelayJoinUrl(inviteId: string, baseUrl = currentBaseUrl()): string {
  return `${baseUrl}${buildOfflineRelayJoinHash(inviteId)}`;
}

export function buildOfflineAnswerUrl(signalText: string, baseUrl = currentBaseUrl()): string {
  return `${baseUrl}${buildOfflineAnswerHash(signalText)}`;
}

export function parseOfflineHash(hash: string): OfflineHashRoute {
  if (!hash) return null;
  const normalized = hash.startsWith('#') ? hash.slice(1) : hash;
  const [path, rawQuery = ''] = normalized.split('?');
  if (path !== '/offline/join' && path !== '/offline/answer') return null;

  const params = new URLSearchParams(rawQuery);
  if (path === '/offline/join') {
    const inviteId = params.get('invite');
    if (inviteId) return { kind: 'join', inviteId, source: 'relay-invite' };
  }

  const signal = params.get('signal');
  if (signal) {
    return { kind: path === '/offline/join' ? 'join' : 'answer', signalText: signal, source: 'signal' };
  }

  const legacyOffer = params.get('offer');
  if (legacyOffer) {
    return { kind: path === '/offline/join' ? 'join' : 'answer', signalText: legacyOffer, source: 'legacy-offer' };
  }

  return null;
}

export function clearOfflineHash(): void {
  if (typeof window === 'undefined') return;
  if (!parseOfflineHash(window.location.hash)) return;
  window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
}

function currentBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
}
