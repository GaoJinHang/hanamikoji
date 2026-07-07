import { ACTION_TYPES, PLAYER_IDS, type ActionType, type PlayerId } from '@hanamikoji/shared';

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; message: string };

export interface PlayActionPayload {
  type: ActionType;
  cardIds: string[];
  grouping?: string[][];
}

export interface JoinRoomPayload {
  roomId: string | null;
  playerName: string;
}

export interface ResumeGamePayload {
  roomId: string;
  playerId: PlayerId;
  reconnectToken: string;
}

const ROOM_ID_PATTERN = /^[A-F0-9]{6}$/;
const RECONNECT_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;
const CARD_ID_PATTERN = /^[a-zA-Z0-9_-]{1,40}$/;

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

function ok<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlayerId(value: unknown): value is PlayerId {
  return typeof value === 'string' && (PLAYER_IDS as readonly string[]).includes(value);
}

function isActionType(value: unknown): value is ActionType {
  return typeof value === 'string' && (ACTION_TYPES as readonly string[]).includes(value);
}

function validateRoomId(value: unknown, allowEmpty = false): ValidationResult<string | null> {
  if (value === null || value === undefined || value === '') {
    return allowEmpty ? ok(null) : fail('房间号无效');
  }

  if (typeof value !== 'string') return fail('房间号无效');
  const normalized = value.trim().toUpperCase();
  if (!ROOM_ID_PATTERN.test(normalized)) return fail('房间号必须是 6 位十六进制字符');
  return ok(normalized);
}

function validatePlayerName(value: unknown): ValidationResult<string> {
  if (typeof value !== 'string') return fail('请输入玩家名称');
  const name = value.trim();
  if (name.length < 1 || name.length > 12) return fail('玩家名称长度必须为 1-12 个字符');
  return ok(name);
}

function validateReconnectToken(value: unknown): ValidationResult<string> {
  if (typeof value !== 'string' || !RECONNECT_TOKEN_PATTERN.test(value)) return fail('重连凭证无效');
  return ok(value);
}

function validateCardIds(value: unknown): ValidationResult<string[]> {
  if (!Array.isArray(value)) return fail('请选择有效的卡牌');
  if (value.length < 1 || value.length > 4) return fail('本次行动的卡牌数量无效');

  const cardIds: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !CARD_ID_PATTERN.test(item)) return fail('卡牌数据无效');
    cardIds.push(item);
  }

  if (new Set(cardIds).size !== cardIds.length) return fail('不能重复选择同一张牌');
  return ok(cardIds);
}

function validateGrouping(value: unknown): ValidationResult<string[][] | undefined> {
  if (value === undefined) return ok(undefined);
  if (!Array.isArray(value) || value.length !== 2) return fail('竞争行动必须提交两个卡牌分组');

  const grouping: string[][] = [];
  for (const group of value) {
    if (!Array.isArray(group) || group.length !== 2) return fail('竞争每组需要2张卡牌');
    const validated = validateCardIds(group);
    if (!validated.ok) return validated;
    grouping.push(validated.value);
  }

  const flattened = grouping.flat();
  if (new Set(flattened).size !== flattened.length) return fail('竞争分组不能包含重复卡牌');
  return ok(grouping);
}

export function validateJoinRoom(roomId: unknown, playerName: unknown): ValidationResult<JoinRoomPayload> {
  const normalizedRoomId = validateRoomId(roomId, true);
  if (!normalizedRoomId.ok) return normalizedRoomId;

  const normalizedName = validatePlayerName(playerName);
  if (!normalizedName.ok) return normalizedName;

  return ok({ roomId: normalizedRoomId.value, playerName: normalizedName.value });
}

export function validatePlayAction(data: unknown): ValidationResult<PlayActionPayload> {
  if (!isRecord(data)) return fail('行动数据无效');
  if (!isActionType(data.type)) return fail('行动类型无效');

  const cardIds = validateCardIds(data.cardIds);
  if (!cardIds.ok) return cardIds;

  const grouping = validateGrouping(data.grouping);
  if (!grouping.ok) return grouping;

  return ok({ type: data.type, cardIds: cardIds.value, grouping: grouping.value });
}

export function validateResolveAction(selection: unknown): ValidationResult<number> {
  if (typeof selection !== 'number' || !Number.isInteger(selection) || selection < 0 || selection > 2) {
    return fail('选择结果无效');
  }
  return ok(selection);
}

export function validateResumeGame(roomId: unknown, playerId: unknown, reconnectToken: unknown): ValidationResult<ResumeGamePayload> {
  const normalizedRoomId = validateRoomId(roomId);
  if (!normalizedRoomId.ok) return fail(normalizedRoomId.message);
  if (normalizedRoomId.value === null) return fail('房间号无效');

  if (!isPlayerId(playerId)) return fail('玩家身份无效');

  const token = validateReconnectToken(reconnectToken);
  if (!token.ok) return token;

  return ok({ roomId: normalizedRoomId.value, playerId, reconnectToken: token.value });
}
