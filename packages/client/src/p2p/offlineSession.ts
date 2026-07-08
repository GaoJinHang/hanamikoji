import {
  ClientRuntime,
  HostRuntime,
  MemoryTransport,
  WebRTCDataChannelEndpoint,
  decodeOfflineSignalPayload,
  decodeSignalPayload,
  encodeOfflineAnswerPayload,
  encodeOfflineInvitePayload,
  encodeSignalPayload,
  type HostRuntimeSnapshot,
  type LobbyStateMessage,
  type OfflineAnswerPayload,
  type OfflineInvitePayload,
  type RuntimeUnsubscribe,
  type WebRTCSignalPayload,
} from '@hanamikoji/p2p';
import type { PlayerId, RoomPlayer } from '@hanamikoji/shared';
import { OfflineP2PConnection } from '../connection/OfflineP2PConnection';
import { HostSwitchboardEndpoint } from './HostSwitchboardEndpoint';
import { buildOfflineAnswerUrl, buildOfflineJoinUrl, parseOfflineHash } from './inviteUrl';
import {
  createRelayInviteOrFallback,
  deleteInvite,
  getInvite,
  startAnswerPolling,
  submitAnswer,
  type AnswerPollingController,
  type CreateRelayInviteResult,
} from './signalingClient';
import {
  clearClientSession,
  clearHostSnapshot,
  loadClientSession,
  loadHostSnapshot,
  saveClientSession,
  saveHostSnapshot,
  type OfflineP2PRole,
} from './storage';

export interface OfflineSessionCallbacks {
  onReady: (connection: OfflineP2PConnection) => void;
  onStateChanged: () => void;
  onStatus: (message: string) => void;
  onError: (message: string) => void;
  onLobbyChanged?: (state: OfflineLobbyView) => void;
}

export interface OfflineLobbyView {
  role: OfflineP2PRole;
  roomId: string;
  playerId: PlayerId | null;
  hostPlayerId: PlayerId;
  players: RoomPlayer[];
  ready: Record<PlayerId, boolean>;
  canStart: boolean;
  localReady: boolean;
  isHostPlayer: boolean;
  connectionStatus: string;
  gameStarted: boolean;
}

export interface HostOfflineSession {
  role: 'host';
  roomId: string;
  offerText: string;
  inviteText: string;
  joinUrl: string;
  relayInviteId?: string;
  relayJoinUrl?: string;
  relayError?: string;
  getLobbyView(): OfflineLobbyView;
  setLobbyReady(ready: boolean): void;
  requestStartGame(): void;
  applyAnswer(answerText: string): Promise<void>;
  dispose(): void;
}

export interface PlayerOfflineSession {
  role: 'player';
  roomId: string;
  answerText: string;
  answerInviteText: string;
  answerUrl: string;
  hostName?: string;
  relayInviteId?: string;
  relayAnswerSubmitted?: boolean;
  getLobbyView(): OfflineLobbyView;
  setLobbyReady(ready: boolean): void;
  requestStartGame(): void;
  dispose(): void;
}

export interface CreateHostOfflineSessionOptions {
  restoreLastHost?: boolean;
}

const DEFAULT_READY: Record<PlayerId, boolean> = { p1: false, p2: false };
const HOST_CONNECTION_TIMEOUT_MS = 20_000;
const PLAYER_JOIN_RETRY_MS = 1_500;

export async function createHostOfflineSession(
  playerName: string,
  callbacks: OfflineSessionCallbacks,
  options: CreateHostOfflineSessionOptions = {},
): Promise<HostOfflineSession> {
  ensureWebRTCSupported();

  const hostPeerId = createPeerId('host');
  const localClientPeerId = createPeerId('host-player');
  const remotePeerId = createPeerId('guest');
  const memory = new MemoryTransport();
  const hostMemoryEndpoint = memory.createEndpoint(hostPeerId);
  const localClientEndpoint = memory.createEndpoint(localClientPeerId);
  const switchboard = new HostSwitchboardEndpoint(hostPeerId);
  switchboard.addRoute(localClientPeerId, hostMemoryEndpoint);

  const snapshot = options.restoreLastHost ? loadHostSnapshot() : null;
  if (!options.restoreLastHost) {
    clearHostSnapshot();
    clearClientSession();
  }

  const hostRuntime = new HostRuntime({ endpoint: switchboard, snapshot });
  let connectionStatus = options.restoreLastHost && snapshot ? '已读取 Host 快照，正在生成邀请。' : '正在创建离线房间。';
  let connection: OfflineP2PConnection | null = null;
  let controllerDisposed = false;
  let answerPolling: AnswerPollingController | null = null;
  let relayInvite: CreateRelayInviteResult | null = null;
  let hostConnectionTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;

  const clearHostConnectionTimeout = () => {
    if (!hostConnectionTimeout) return;
    globalThis.clearTimeout(hostConnectionTimeout);
    hostConnectionTimeout = null;
  };

  const saved = options.restoreLastHost ? loadClientSession() : null;
  const resume = saved?.role === 'host'
    ? { playerId: saved.playerId, reconnectToken: saved.reconnectToken, stateVersion: saved.lastStateVersion, viewHash: saved.lastViewHash }
    : null;

  const clientRuntime = new ClientRuntime({
    endpoint: localClientEndpoint,
    hostPeerId,
    playerName,
    resume,
  });

  const notifyLobby = () => callbacks.onLobbyChanged?.(buildLobbyView('host', clientRuntime, hostRuntime.roomId, connectionStatus));
  const setSessionStatus = (message: string) => {
    connectionStatus = message;
    callbacks.onStatus(message);
    notifyLobby();
  };

  const controllerDispose = () => {
    if (controllerDisposed) return;
    controllerDisposed = true;
    answerPolling?.stop();
    clearHostConnectionTimeout();
    if (relayInvite) void deleteInvite(relayInvite.inviteId).catch(() => undefined);
    connection?.dispose();
    clientRuntime.dispose();
    hostRuntime.dispose();
    switchboard.disconnect();
    unsubscribers.forEach(unsubscribe => unsubscribe());
  };

  const ensureConnection = () => {
    if (!connection) {
      connection = new OfflineP2PConnection(clientRuntime, {
        onDispose: controllerDispose,
        onStateChanged: callbacks.onStateChanged,
      });
    }
    return connection;
  };

  const unsubscribers: RuntimeUnsubscribe[] = [
    hostRuntime.on('snapshotChanged', (nextSnapshot: HostRuntimeSnapshot) => saveHostSnapshot(nextSnapshot)),
    hostRuntime.on('peerJoined', player => setSessionStatus(`玩家 ${player.name} 已加入，等待双方 Ready。`)),
    hostRuntime.on('peerReconnected', player => setSessionStatus(`玩家 ${player.name} 已恢复 DataChannel 连接。`)),
    hostRuntime.on('peerDisconnected', player => setSessionStatus(`玩家 ${player.name} 已断开，请重新交换连接信息。`)),
    hostRuntime.on('lobbyState', notifyLobby),
  ];

  bindClientRuntime(clientRuntime, 'host', callbacks, hostRuntime.roomId, ensureConnection, notifyLobby, setSessionStatus);
  clientRuntime.join({ requestedRoomId: hostRuntime.roomId, requestedPlayerId: resume?.playerId ?? 'p1', reconnectToken: resume?.reconnectToken });

  setSessionStatus('正在生成离线邀请...');
  const { endpoint: rtcEndpoint, signal } = await WebRTCDataChannelEndpoint.createOffer({
    hostPeerId,
    remotePeerId,
    roomId: hostRuntime.roomId,
    iceServers: parseIceServersFromEnv(),
  });
  const offerText = encodeSignalPayload(signal);
  const invitePayload: OfflineInvitePayload = {
    kind: 'hanamikoji-offline-invite',
    version: 1,
    mode: 'manual-webrtc',
    roomId: hostRuntime.roomId,
    hostName: playerName,
    hostOffer: offerText,
    createdAt: Date.now(),
  };
  const inviteText = await encodeOfflineInvitePayload(invitePayload);
  const fallbackJoinUrl = buildOfflineJoinUrl(inviteText);
  const relayResult = await createRelayInviteOrFallback({
    roomId: hostRuntime.roomId,
    hostName: playerName,
    hostOffer: offerText,
  }, fallbackJoinUrl);
  relayInvite = relayResult.relay;
  const joinUrl = relayResult.joinUrl;

  switchboard.addRoute(remotePeerId, rtcEndpoint);
  rtcEndpoint.onReconnect(() => {
    clearHostConnectionTimeout();
    setSessionStatus('DataChannel 已连接，等待 Player 加入或双方 Ready。');
  });
  rtcEndpoint.onDisconnect(() => setSessionStatus('DataChannel 已断开，请重新创建/恢复房间并交换连接信息。'));

  const startHostConnectionWatchdog = () => {
    clearHostConnectionTimeout();
    if (rtcEndpoint.isOnline) return;
    hostConnectionTimeout = globalThis.setTimeout(() => {
      if (controllerDisposed || rtcEndpoint.isOnline) return;
      const message = '已导入 answer，但 20 秒内没有建立 DataChannel。纯手动 WebRTC P2P 不能保证所有网络都能直连：请确认两台设备同时停留在此页面，优先使用同一 Wi-Fi 或手机热点；若仍失败，需要配置 TURN 或改用在线服务器模式。';
      setSessionStatus(message);
      callbacks.onError(message);
    }, HOST_CONNECTION_TIMEOUT_MS);
  };

  const applyAnswerText = async (answerText: string, relayPlayerName?: string) => {
    const answerSignal = await readPlayerAnswerSignal(answerText, hostRuntime.roomId);
    setSessionStatus(relayPlayerName ? `已收到 ${relayPlayerName} 的 relay answer，正在建立 DataChannel。` : '已导入 answer，正在建立 DataChannel。');
    await rtcEndpoint.applyAnswer(answerSignal);
    startHostConnectionWatchdog();
  };

  if (relayInvite) {
    answerPolling = startAnswerPolling(relayInvite.inviteId, {
      applyAnswer: applyAnswerText,
      onExpired: () => {
        setSessionStatus('邀请已过期，请重新创建离线房间。');
        callbacks.onError('邀请已过期，请重新创建离线房间。');
      },
      onError: error => callbacks.onError(`Relay 轮询失败：${error.message}。可继续使用手动 answer 兜底。`),
    });
    setSessionStatus('已生成扫码邀请，等待 Player 提交 answer。');
  } else {
    const reason = relayResult.error?.message ? `（relay 不可用：${relayResult.error.message}）` : '';
    setSessionStatus(`已生成纯离线邀请，请发送链接或 invite，并等待 Player answer。${reason}`);
  }

  return {
    role: 'host',
    roomId: hostRuntime.roomId,
    offerText,
    inviteText,
    joinUrl,
    relayInviteId: relayInvite?.inviteId,
    relayJoinUrl: relayInvite?.joinUrl,
    relayError: relayResult.error?.message,
    getLobbyView: () => buildLobbyView('host', clientRuntime, hostRuntime.roomId, connectionStatus),
    setLobbyReady: ready => clientRuntime.setLobbyReady(ready),
    requestStartGame: () => clientRuntime.requestStartGame(),
    async applyAnswer(answerText: string) {
      answerPolling?.stop();
      await applyAnswerText(answerText);
      if (relayInvite) await deleteInvite(relayInvite.inviteId).catch(() => undefined);
    },
    dispose: controllerDispose,
  };
}

export async function createPlayerOfflineSession(
  playerName: string,
  offerOrInviteText: string,
  callbacks: OfflineSessionCallbacks,
): Promise<PlayerOfflineSession> {
  ensureWebRTCSupported();

  const hostInvite = await readHostOfferSignal(offerOrInviteText);
  const offer = hostInvite.offer;
  callbacks.onStatus('已读取 Host 邀请，正在生成 Player answer。');

  const { endpoint, signal } = await WebRTCDataChannelEndpoint.acceptOffer({ offer, iceServers: parseIceServersFromEnv() });
  let connectionStatus = 'Player answer 已生成，请复制回 Host 当前页面导入。';
  let connection: OfflineP2PConnection | null = null;
  let controllerDisposed = false;
  let joinRetryTimer: ReturnType<typeof globalThis.setInterval> | null = null;

  const stopJoinRetry = () => {
    if (!joinRetryTimer) return;
    globalThis.clearInterval(joinRetryTimer);
    joinRetryTimer = null;
  };

  const saved = loadClientSession();
  const resume = saved?.role === 'player' && saved.roomId === offer.roomId
    ? { playerId: saved.playerId, reconnectToken: saved.reconnectToken, stateVersion: saved.lastStateVersion, viewHash: saved.lastViewHash }
    : null;

  const clientRuntime = new ClientRuntime({
    endpoint,
    hostPeerId: offer.hostPeerId,
    playerName,
    resume,
  });

  const notifyLobby = () => callbacks.onLobbyChanged?.(buildLobbyView('player', clientRuntime, offer.roomId, connectionStatus));
  const setSessionStatus = (message: string) => {
    connectionStatus = message;
    callbacks.onStatus(message);
    notifyLobby();
  };

  let stopJoinRetryOnJoined: RuntimeUnsubscribe | null = null;

  const controllerDispose = () => {
    if (controllerDisposed) return;
    controllerDisposed = true;
    stopJoinRetry();
    stopJoinRetryOnJoined?.();
    connection?.dispose();
    clientRuntime.dispose();
    endpoint.disconnect();
  };

  const ensureConnection = () => {
    if (!connection) {
      connection = new OfflineP2PConnection(clientRuntime, {
        onDispose: controllerDispose,
        onStateChanged: callbacks.onStateChanged,
      });
    }
    return connection;
  };

  const sendJoinRequest = () => {
    clientRuntime.join({
      requestedRoomId: offer.roomId,
      requestedPlayerId: resume?.playerId,
      reconnectToken: resume?.reconnectToken,
      lastStateVersion: resume?.stateVersion,
      lastViewHash: resume?.viewHash ?? undefined,
    });
  };

  const startJoinRetry = () => {
    sendJoinRequest();
    if (joinRetryTimer) return;
    joinRetryTimer = globalThis.setInterval(() => {
      if (controllerDisposed || clientRuntime.playerId || !endpoint.isOnline) {
        stopJoinRetry();
        return;
      }
      sendJoinRequest();
    }, PLAYER_JOIN_RETRY_MS);
  };

  bindClientRuntime(clientRuntime, 'player', callbacks, offer.roomId, ensureConnection, notifyLobby, setSessionStatus);
  stopJoinRetryOnJoined = clientRuntime.on('joined', stopJoinRetry);
  endpoint.onReconnect(() => {
    setSessionStatus('DataChannel 已连接，正在向 Host 发送 JOIN_REQUEST，等待 Host 确认加入。');
    startJoinRetry();
  });
  endpoint.onDisconnect(() => {
    stopJoinRetry();
    setSessionStatus('DataChannel 已断开，请重新交换连接信息。');
  });
  startJoinRetry();
  if (endpoint.isOnline) startJoinRetry();

  const answerText = encodeSignalPayload(signal);
  const answerPayload: OfflineAnswerPayload = {
    kind: 'hanamikoji-offline-answer',
    version: 1,
    mode: 'manual-webrtc',
    roomId: offer.roomId,
    playerName,
    playerAnswer: answerText,
    createdAt: Date.now(),
  };
  const answerInviteText = await encodeOfflineAnswerPayload(answerPayload);
  const answerUrl = buildOfflineAnswerUrl(answerInviteText);
  let relayAnswerSubmitted = false;
  if (hostInvite.relayInviteId) {
    try {
      await submitAnswer(hostInvite.relayInviteId, { playerName, answer: answerInviteText });
      relayAnswerSubmitted = true;
      setSessionStatus('answer 已通过 relay 提交，等待 Host 自动连接。');
    } catch (error) {
      callbacks.onError(`Relay 提交 answer 失败：${error instanceof Error ? error.message : '未知错误'}。请复制 answer 给 Host。`);
      setSessionStatus('answer 已生成，请复制给 Host 导入。');
    }
  } else {
    setSessionStatus('answer 已生成，请复制给 Host 导入。');
  }

  return {
    role: 'player',
    roomId: offer.roomId,
    answerText,
    answerInviteText,
    answerUrl,
    hostName: hostInvite.hostName,
    relayInviteId: hostInvite.relayInviteId,
    relayAnswerSubmitted,
    getLobbyView: () => buildLobbyView('player', clientRuntime, offer.roomId, connectionStatus),
    setLobbyReady: ready => clientRuntime.setLobbyReady(ready),
    requestStartGame: () => clientRuntime.requestStartGame(),
    dispose: controllerDispose,
  };
}

function bindClientRuntime(
  runtime: ClientRuntime,
  role: OfflineP2PRole,
  callbacks: OfflineSessionCallbacks,
  fallbackRoomId: string,
  ensureConnection: () => OfflineP2PConnection,
  notifyLobby: () => void,
  setSessionStatus: (message: string) => void,
): void {
  let ready = false;

  const persist = () => {
    if (!runtime.playerId || !runtime.reconnectToken) return;
    saveClientSession({
      role,
      roomId: runtime.gameState?.roomId ?? runtime.roomId ?? fallbackRoomId,
      playerId: runtime.playerId,
      reconnectToken: runtime.reconnectToken,
      lastStateVersion: runtime.stateVersion,
      lastViewHash: runtime.viewHash,
      updatedAt: Date.now(),
    });
  };

  const maybeReady = () => {
    persist();
    if (ready || !runtime.gameState) return;
    ready = true;
    callbacks.onReady(ensureConnection());
  };

  runtime.on('joined', message => {
    setSessionStatus(message.resumed ? `已恢复为 ${message.playerId}，等待同步或双方 Ready。` : `已加入为 ${message.playerId}，等待对手和双方 Ready。`);
    persist();
    notifyLobby();
  });
  runtime.on('lobbyState', () => {
    persist();
    notifyLobby();
  });
  runtime.on('startGameRejected', message => callbacks.onError(message.reason));
  runtime.on('gameStarted', () => {
    setSessionStatus('游戏已开始。');
    maybeReady();
  });
  runtime.on('stateView', () => {
    maybeReady();
    callbacks.onStateChanged();
  });
  runtime.on('syncRequested', () => setSessionStatus('检测到状态不连续，正在请求同步。'));
  runtime.on('joinRejected', message => callbacks.onError(message.reason));
  runtime.on('actionRejected', message => callbacks.onError(message.reason));
  runtime.on('error', message => callbacks.onError(message.message));
}

function buildLobbyView(
  role: OfflineP2PRole,
  runtime: ClientRuntime,
  fallbackRoomId: string,
  connectionStatus: string,
): OfflineLobbyView {
  const lobby: LobbyStateMessage | null = runtime.lobbyState;
  const ready = lobby?.ready ?? DEFAULT_READY;
  const hostPlayerId = lobby?.hostPlayerId ?? 'p1';
  const playerId = runtime.playerId;
  return {
    role,
    roomId: lobby?.roomId ?? runtime.roomId ?? fallbackRoomId,
    playerId,
    hostPlayerId,
    players: lobby?.players ?? [],
    ready: { p1: Boolean(ready.p1), p2: Boolean(ready.p2) },
    canStart: Boolean(lobby?.canStart),
    localReady: playerId ? Boolean(ready[playerId]) : false,
    isHostPlayer: playerId === hostPlayerId,
    connectionStatus,
    gameStarted: Boolean(runtime.gameState),
  };
}

async function readHostOfferSignal(input: string): Promise<{ offer: WebRTCSignalPayload; hostName?: string; relayInviteId?: string }> {
  const relayInviteId = extractRelayInviteId(input);
  if (relayInviteId) {
    const relayInvite = await getInvite(relayInviteId);
    const offer = decodeSignalPayload(relayInvite.hostOffer);
    if (offer.role !== 'host-offer') throw new Error('Relay invite 格式无效：hostOffer 不是 Host offer。');
    if (offer.roomId !== relayInvite.roomId) throw new Error('Relay invite 格式无效：roomId 与 offer 不一致。');
    return { offer, hostName: relayInvite.hostName, relayInviteId: relayInvite.inviteId };
  }

  const signalText = extractSignalText(input);
  const decoded = await decodeOfflineSignalPayload(signalText);
  if ('role' in decoded) {
    if (decoded.role !== 'host-offer') throw new Error('信令格式无效：请粘贴 Host offer。');
    return { offer: decoded };
  }
  if (decoded.kind !== 'hanamikoji-offline-invite') {
    throw new Error('离线邀请格式无效：请粘贴 Host invite。');
  }
  const offer = decodeSignalPayload(decoded.hostOffer);
  if (offer.role !== 'host-offer') throw new Error('离线邀请格式无效：hostOffer 不是 Host offer。');
  if (offer.roomId !== decoded.roomId) throw new Error('离线邀请格式无效：roomId 与 offer 不一致。');
  return { offer, hostName: decoded.hostName };
}

async function readPlayerAnswerSignal(input: string, expectedRoomId: string): Promise<WebRTCSignalPayload> {
  const signalText = extractSignalText(input);
  const decoded = await decodeOfflineSignalPayload(signalText);
  if ('role' in decoded) {
    if (decoded.role !== 'player-answer') throw new Error('信令格式无效：请粘贴 Player answer。');
    if (decoded.roomId !== expectedRoomId) throw new Error('信令不匹配：answer 不属于当前离线房间。');
    return decoded;
  }
  if (decoded.kind !== 'hanamikoji-offline-answer') {
    throw new Error('离线 answer 格式无效：请粘贴 Player answer。');
  }
  if (decoded.roomId !== expectedRoomId) throw new Error('信令不匹配：answer 不属于当前离线房间。');
  const answer = decodeSignalPayload(decoded.playerAnswer);
  if (answer.role !== 'player-answer') throw new Error('离线 answer 格式无效：playerAnswer 不是 Player answer。');
  return answer;
}

function extractSignalText(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  const hashIndex = trimmed.indexOf('#/offline/');
  if (hashIndex >= 0) {
    const parsed = parseOfflineHash(trimmed.slice(hashIndex));
    if (parsed && 'signalText' in parsed) return parsed.signalText;
    if (parsed?.source === 'relay-invite') throw new Error('Relay invite 需要先从服务器读取 Host offer。');
  }
  return trimmed;
}

function extractRelayInviteId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const hashIndex = trimmed.indexOf('#/offline/');
  if (hashIndex >= 0) {
    const parsed = parseOfflineHash(trimmed.slice(hashIndex));
    if (parsed?.kind === 'join' && parsed.source === 'relay-invite') return parsed.inviteId;
  }
  if (/^[A-Za-z0-9_-]{10,80}$/.test(trimmed) && !trimmed.startsWith('HANA-')) return trimmed;
  return null;
}

function ensureWebRTCSupported(): void {
  if (typeof RTCPeerConnection === 'undefined') {
    throw new Error('当前浏览器不支持 WebRTC DataChannel。');
  }
}


export function parseIceServersFromEnv(rawValue?: string): RTCIceServer[] {
  const raw = typeof rawValue === 'string' ? rawValue : import.meta.env?.VITE_P2P_ICE_SERVERS;
  const value = raw?.trim();
  if (!value) return [];

  if (value.startsWith('[') || value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value) as RTCIceServer[] | RTCIceServer;
      const servers = Array.isArray(parsed) ? parsed : [parsed];
      return servers.filter(isValidIceServer);
    } catch {
      throw new Error('VITE_P2P_ICE_SERVERS JSON 格式无效。');
    }
  }

  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .map(url => ({ urls: url }));
}

function isValidIceServer(value: unknown): value is RTCIceServer {
  const candidate = value as RTCIceServer | null;
  if (!candidate) return false;
  if (typeof candidate.urls === 'string') return Boolean(candidate.urls.trim());
  if (Array.isArray(candidate.urls)) return candidate.urls.some(item => typeof item === 'string' && Boolean(item.trim()));
  return false;
}

function createPeerId(prefix: string): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}
