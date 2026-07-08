import { buildOfflineRelayJoinUrl } from './inviteUrl';

export interface CreateRelayInviteInput {
  roomId: string;
  hostName: string;
  hostOffer: string;
  ttlMs?: number;
  baseUrl?: string;
}

export interface CreateRelayInviteResult {
  inviteId: string;
  roomId: string;
  hostName: string;
  joinUrl: string;
  createdAt: number;
  expiresAt: number;
}

export interface RelayInvite {
  inviteId: string;
  roomId: string;
  hostName: string;
  hostOffer: string;
  createdAt: number;
  expiresAt: number;
  hasAnswer: boolean;
}

export interface PlayerAnswer {
  answer: string;
  playerName: string;
  createdAt: number;
}

export interface RelayInviteFallbackResult {
  relay: CreateRelayInviteResult | null;
  joinUrl: string;
  error: Error | null;
}

const DEFAULT_RELAY_CREATE_TIMEOUT_MS = 2500;

export interface AnswerPollingController {
  stop(): void;
}

export class SignalingRelayError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, code: string | undefined, message: string) {
    super(message);
    this.name = 'SignalingRelayError';
    this.status = status;
    this.code = code;
  }
}

export async function createInvite(input: CreateRelayInviteInput): Promise<CreateRelayInviteResult> {
  const response = await requestJson<{
    inviteId: string;
    roomId: string;
    hostName: string;
    createdAt: number;
    expiresAt: number;
  }>('/api/p2p/invites', {
    method: 'POST',
    body: JSON.stringify({
      roomId: input.roomId,
      hostName: input.hostName,
      hostOffer: input.hostOffer,
      ttlMs: input.ttlMs,
    }),
  });

  return {
    ...response,
    joinUrl: buildOfflineRelayJoinUrl(response.inviteId, input.baseUrl),
  };
}

export async function getInvite(inviteId: string): Promise<RelayInvite> {
  return requestJson<RelayInvite>(`/api/p2p/invites/${encodeURIComponent(inviteId)}`);
}

export async function submitAnswer(inviteId: string, answer: { answer: string; playerName: string }): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/p2p/invites/${encodeURIComponent(inviteId)}/answer`, {
    method: 'POST',
    body: JSON.stringify({ answer: answer.answer, playerName: answer.playerName }),
  });
}

export async function pollAnswer(inviteId: string): Promise<PlayerAnswer | null> {
  const response = await request(`/api/p2p/invites/${encodeURIComponent(inviteId)}/answer`);
  if (response.status === 204) return null;
  return readResponseJson<PlayerAnswer>(response);
}

export async function deleteInvite(inviteId: string): Promise<void> {
  const response = await request(`/api/p2p/invites/${encodeURIComponent(inviteId)}`, { method: 'DELETE' });
  if (response.status !== 204 && response.status !== 404) {
    await readResponseJson(response);
  }
}

export async function createRelayInviteOrFallback(
  input: CreateRelayInviteInput,
  fallbackJoinUrl: string,
  createFn: (nextInput: CreateRelayInviteInput) => Promise<CreateRelayInviteResult> = createInvite,
): Promise<RelayInviteFallbackResult> {
  try {
    const relay = await withTimeout(createFn(input), DEFAULT_RELAY_CREATE_TIMEOUT_MS);
    return { relay, joinUrl: relay.joinUrl, error: null };
  } catch (error) {
    return { relay: null, joinUrl: fallbackJoinUrl, error: toError(error) };
  }
}

export function startAnswerPolling(
  inviteId: string,
  options: {
    intervalMs?: number;
    pollAnswerFn?: (nextInviteId: string) => Promise<PlayerAnswer | null>;
    applyAnswer: (answerText: string, playerName?: string) => Promise<void>;
    deleteInviteFn?: (nextInviteId: string) => Promise<void>;
    onError?: (error: Error) => void;
    onExpired?: (error: SignalingRelayError) => void;
  },
): AnswerPollingController {
  const intervalMs = options.intervalMs ?? 1000;
  const pollAnswerFn = options.pollAnswerFn ?? pollAnswer;
  const deleteInviteFn = options.deleteInviteFn ?? deleteInvite;
  let stopped = false;
  let inFlight = false;
  let timerId: ReturnType<typeof setInterval> | null = null;
  let lastErrorFingerprint: string | null = null;
  let repeatedErrorCount = 0;

  const stop = () => {
    stopped = true;
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  };

  const reportNonTerminalError = (error: unknown) => {
    const normalized = toError(error);
    const fingerprint = fingerprintError(normalized);
    if (fingerprint === lastErrorFingerprint) {
      repeatedErrorCount += 1;
    } else {
      lastErrorFingerprint = fingerprint;
      repeatedErrorCount = 1;
    }

    if (repeatedErrorCount <= 3) {
      options.onError?.(normalized);
    }
  };

  const tick = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const answer = await pollAnswerFn(inviteId);
      lastErrorFingerprint = null;
      repeatedErrorCount = 0;
      if (!answer || stopped) return;
      stop();
      await options.applyAnswer(answer.answer, answer.playerName);
      await deleteInviteFn(inviteId).catch(() => undefined);
    } catch (error) {
      if (isInviteNotFoundError(error)) {
        stop();
        const expiredError = new SignalingRelayError(
          getRelayErrorStatus(error) ?? 404,
          getRelayErrorCode(error) ?? 'INVITE_NOT_FOUND',
          '邀请已过期，请重新创建房间。',
        );
        if (options.onExpired) {
          options.onExpired(expiredError);
        } else {
          options.onError?.(expiredError);
        }
        return;
      }
      reportNonTerminalError(error);
    } finally {
      inFlight = false;
    }
  };

  timerId = setInterval(() => { void tick(); }, intervalMs);
  void tick();
  return { stop };
}

export function buildApiUrl(path: string, baseUrl = getApiBaseUrl()): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!baseUrl) return normalizedPath;
  return `${baseUrl.replace(/\/+$/, '')}${normalizedPath}`;
}

function getApiBaseUrl(): string {
  const env = import.meta.env?.VITE_API_BASE_URL?.trim();
  return env ?? '';
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('signaling relay 请求超时，已改用纯离线邀请。'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  return readResponseJson<T>(await request(path, init));
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(buildApiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

async function readResponseJson<T>(response: Response): Promise<T> {
  if (response.ok) return response.json() as Promise<T>;

  let code: string | undefined;
  let message = `signaling relay 请求失败（HTTP ${response.status}）。`;
  try {
    const payload = await response.json() as { message?: unknown; error?: unknown };
    code = typeof payload.error === 'string' ? payload.error : undefined;
    if (typeof payload.message === 'string' && payload.message.trim()) {
      message = payload.message;
    } else if (code) {
      message = code;
    }
  } catch {
    // Keep fallback message.
  }

  throw new SignalingRelayError(response.status, code, message);
}

function isInviteNotFoundError(error: unknown): boolean {
  return getRelayErrorStatus(error) === 404 || getRelayErrorCode(error) === 'INVITE_NOT_FOUND';
}

function getRelayErrorStatus(error: unknown): number | undefined {
  if (error instanceof SignalingRelayError) return error.status;
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

function getRelayErrorCode(error: unknown): string | undefined {
  if (error instanceof SignalingRelayError) return error.code;
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function fingerprintError(error: Error): string {
  if (error instanceof SignalingRelayError) {
    return `${error.status}:${error.code ?? ''}:${error.message}`;
  }
  return error.message;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
