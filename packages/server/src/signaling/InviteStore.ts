import crypto from 'crypto';

export interface RelayInviteRecord {
  inviteId: string;
  roomId: string;
  hostOffer: string;
  hostName: string;
  answer?: string;
  playerName?: string;
  answerCreatedAt?: number;
  createdAt: number;
  expiresAt: number;
}

export interface CreateInviteInput {
  roomId: string;
  hostOffer: string;
  hostName: string;
  ttlMs?: number;
}

export interface SubmitAnswerInput {
  answer: string;
  playerName: string;
}

export const DEFAULT_INVITE_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_MAX_INVITES = 5_000;
export const MAX_SIGNAL_TEXT_LENGTH = 64_000;
export const MAX_PLAYER_NAME_LENGTH = 24;
export const MAX_ROOM_ID_LENGTH = 48;

const SIGNAL_PREFIXES = ['HANA-P2P-V1:', 'HANA-INVITE-V1:'];

export class InviteStore {
  private readonly invites = new Map<string, RelayInviteRecord>();

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly defaultTtlMs: number = DEFAULT_INVITE_TTL_MS,
    private readonly maxInvites: number = DEFAULT_MAX_INVITES,
  ) {}

  create(input: CreateInviteInput): RelayInviteRecord {
    this.cleanupExpired();
    if (this.invites.size >= this.maxInvites) {
      throw new InviteStoreFullError();
    }

    const roomId = sanitizeRoomId(input.roomId);
    const hostName = sanitizePlayerName(input.hostName);
    validateSignalText(input.hostOffer, 'hostOffer');

    const createdAt = this.now();
    const ttlMs = normalizeTtlMs(input.ttlMs, this.defaultTtlMs);
    const record: RelayInviteRecord = {
      inviteId: this.createInviteId(),
      roomId,
      hostOffer: input.hostOffer.trim(),
      hostName,
      createdAt,
      expiresAt: createdAt + ttlMs,
    };
    this.invites.set(record.inviteId, record);
    return cloneRecord(record);
  }

  get(inviteId: string): RelayInviteRecord | null {
    this.cleanupExpired();
    const record = this.invites.get(inviteId);
    if (!record) return null;
    if (this.isExpired(record)) {
      this.invites.delete(inviteId);
      return null;
    }
    return cloneRecord(record);
  }

  submitAnswer(inviteId: string, input: SubmitAnswerInput): RelayInviteRecord | null {
    this.cleanupExpired();
    const record = this.invites.get(inviteId);
    if (!record) return null;
    if (this.isExpired(record)) {
      this.invites.delete(inviteId);
      return null;
    }
    if (record.answer) {
      throw new InviteAnswerAlreadySubmittedError();
    }

    validateSignalText(input.answer, 'answer');
    const answerCreatedAt = this.now();
    record.answer = input.answer.trim();
    record.playerName = sanitizePlayerName(input.playerName);
    record.answerCreatedAt = answerCreatedAt;
    return cloneRecord(record);
  }

  getAnswer(inviteId: string): { answer: string; playerName: string; createdAt: number } | null {
    this.cleanupExpired();
    const record = this.invites.get(inviteId);
    if (!record) return null;
    if (this.isExpired(record)) {
      this.invites.delete(inviteId);
      return null;
    }
    if (!record.answer || !record.playerName) return null;

    const answer = {
      answer: record.answer,
      playerName: record.playerName,
      createdAt: record.answerCreatedAt ?? record.createdAt,
    };
    this.invites.delete(inviteId);
    return answer;
  }

  delete(inviteId: string): boolean {
    return this.invites.delete(inviteId);
  }

  cleanupExpired(): number {
    const now = this.now();
    let removed = 0;
    for (const [inviteId, record] of this.invites) {
      if (record.expiresAt <= now) {
        this.invites.delete(inviteId);
        removed += 1;
      }
    }
    return removed;
  }

  snapshotForTest(): RelayInviteRecord[] {
    this.cleanupExpired();
    return [...this.invites.values()].map(cloneRecord);
  }

  private createInviteId(): string {
    let inviteId = crypto.randomBytes(12).toString('base64url');
    while (this.invites.has(inviteId)) {
      inviteId = crypto.randomBytes(12).toString('base64url');
    }
    return inviteId;
  }

  private isExpired(record: RelayInviteRecord): boolean {
    return record.expiresAt <= this.now();
  }
}

export class InviteValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'InviteValidationError';
  }
}

export class InvitePayloadTooLargeError extends Error {
  readonly status = 413;
  constructor(fieldName: string) {
    super(`${fieldName} 太长，请使用较短的 HANA-P2P-V1 或 HANA-INVITE-V1 文本。`);
    this.name = 'InvitePayloadTooLargeError';
  }
}

export class InviteStoreFullError extends Error {
  readonly status = 503;
  constructor() {
    super('当前离线邀请过多，请稍后再试。');
    this.name = 'InviteStoreFullError';
  }
}

export class InviteAnswerAlreadySubmittedError extends Error {
  readonly status = 409;
  constructor() {
    super('该 invite 已经提交过 Player answer。请重新创建离线房间。');
    this.name = 'InviteAnswerAlreadySubmittedError';
  }
}

function validateSignalText(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new InviteValidationError(`${fieldName} 不能为空。`);
  }
  if (value.length > MAX_SIGNAL_TEXT_LENGTH) {
    throw new InvitePayloadTooLargeError(fieldName);
  }
  const trimmed = value.trim();
  if (!SIGNAL_PREFIXES.some(prefix => trimmed.startsWith(prefix))) {
    throw new InviteValidationError(`${fieldName} 必须是 HANA-P2P-V1 或 HANA-INVITE-V1 文本。`);
  }
}

function sanitizePlayerName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new InviteValidationError('playerName/hostName 不能为空。');
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_PLAYER_NAME_LENGTH) {
    throw new InviteValidationError(`昵称不能超过 ${MAX_PLAYER_NAME_LENGTH} 个字符。`);
  }
  return trimmed;
}

function sanitizeRoomId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new InviteValidationError('roomId 不能为空。');
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_ROOM_ID_LENGTH) {
    throw new InviteValidationError(`roomId 不能超过 ${MAX_ROOM_ID_LENGTH} 个字符。`);
  }
  return trimmed;
}

function normalizeTtlMs(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), 30_000), DEFAULT_INVITE_TTL_MS);
}

function cloneRecord(record: RelayInviteRecord): RelayInviteRecord {
  return { ...record };
}
