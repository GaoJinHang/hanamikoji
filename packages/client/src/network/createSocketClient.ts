import type { ClientToServerEvents, ServerToClientEvents } from '@hanamikoji/shared';

type EventName = Extract<keyof ServerToClientEvents, string> | 'connect' | 'disconnect' | 'connect_error' | 'roomJoined' | 'stateSync';
type EventHandler = (...args: any[]) => void;

type OutgoingEvent = Extract<keyof ClientToServerEvents, string> | 'leaveRoom' | 'ping';

type QueuedMessage = {
  type: OutgoingEvent;
  payload?: unknown;
};

export interface SocketClient {
  readonly id: string;
  readonly connected: boolean;
  emit(event: OutgoingEvent, ...args: any[]): void;
  on(event: EventName, handler: EventHandler): this;
  off(event: EventName, handler?: EventHandler): this;
  disconnect(): void;
}

function randomClientId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getOrCreateClientId(): string {
  if (typeof window === 'undefined') {
    return randomClientId();
  }

  const storageKey = 'hanamikoji_clientPlayerId';
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) {
    return existing;
  }

  const next = randomClientId();
  window.sessionStorage.setItem(storageKey, next);
  return next;
}

function normalizeRoomId(roomId: string | null | undefined): string {
  const trimmed = roomId?.trim().toUpperCase();
  return trimmed || 'ROOM-001';
}

function ensureProtocol(url: string): string {
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(url)) {
    return url;
  }
  return `https://${url}`;
}

function normalizeCandidateBase(url?: string): string | null {
  const raw = (url || '').trim();
  if (!raw) {
    return null;
  }

  if (raw.startsWith('/')) {
    return raw.replace(/\/$/, '');
  }

  const withProtocol = ensureProtocol(raw);
  return withProtocol
    .replace(/^https:\/\//i, 'wss://')
    .replace(/^http:\/\//i, 'ws://')
    .replace(/\/$/, '');
}

function getSameOriginBase(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

function getCandidateBases(url?: string): string[] {
  const candidates = [normalizeCandidateBase(url), getSameOriginBase()].filter((value): value is string => Boolean(value));
  return Array.from(new Set(candidates));
}

function buildSocketUrl(base: string, roomId: string, clientId: string): string {
  const normalizedRoomId = normalizeRoomId(roomId);
  const isRelative = base.startsWith('/');

  const url = isRelative
    ? new URL(base, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    : new URL(base);

  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else if (url.protocol === 'https:') {
    url.protocol = 'wss:';
  }

  if (!url.pathname || url.pathname === '/') {
    url.pathname = '/ws';
  } else if (!url.pathname.endsWith('/ws')) {
    url.pathname = `${url.pathname.replace(/\/$/, '')}/ws`;
  }

  url.searchParams.set('roomId', normalizedRoomId);
  url.searchParams.set('clientPlayerId', clientId);
  return url.toString();
}

function buildPayload(event: OutgoingEvent, args: any[], clientId: string): unknown {
  switch (event) {
    case 'joinRoom': {
      const roomId = normalizeRoomId(args[0] ?? null);
      const name = typeof args[1] === 'string' ? args[1].trim() : '';
      return {
        roomId,
        playerId: clientId,
        name,
      };
    }
    case 'resolveAction':
      return { selection: args[0] };
    default:
      return args[0];
  }
}

function normalizeIncomingMessage(message: { type: string; payload?: any }, emitLocal: (event: string, ...args: any[]) => void): void {
  const payload = message.payload;

  switch (message.type) {
    case 'gameStarted':
      emitLocal('gameStarted', payload?.state, payload?.playerId);
      return;
    case 'stateSync':
      emitLocal('stateSync', payload);
      emitLocal('gameStateUpdate', payload);
      return;
    case 'phaseChanged':
      emitLocal('phaseChanged', payload?.phase, payload?.activePlayer);
      return;
    case 'actionRequired':
      emitLocal('actionRequired', payload?.type, payload?.minCards, payload?.maxCards);
      return;
    case 'error':
      emitLocal('error', payload?.message ?? payload ?? '未知错误');
      return;
    default:
      emitLocal(message.type, payload);
  }
}

export function createSocketClient(url?: string): SocketClient {
  const clientId = getOrCreateClientId();
  const listeners = new Map<string, Set<EventHandler>>();
  const sendQueue: QueuedMessage[] = [];
  const candidateBases = getCandidateBases(url);

  let connected = false;
  let currentRoomId: string | null = null;
  let ws: WebSocket | null = null;
  let heartbeatTimer: number | null = null;
  let activeAttemptToken = 0;

  const emitLocal = (event: string, ...args: any[]) => {
    const handlers = listeners.get(event);
    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      handler(...args);
    }
  };

  const stopHeartbeat = () => {
    if (typeof window !== 'undefined' && heartbeatTimer !== null) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const flushQueue = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    while (sendQueue.length > 0) {
      const next = sendQueue.shift();
      if (!next) {
        continue;
      }
      ws.send(JSON.stringify(next));
    }
  };

  const reportConnectError = (message: string) => {
    emitLocal('connect_error', new Error(message));
  };

  const connectWithFallback = (roomId: string, baseIndex = 0) => {
    const normalizedRoomId = normalizeRoomId(roomId);
    const token = ++activeAttemptToken;
    const base = candidateBases[baseIndex];

    if (!base) {
      reportConnectError('未配置可用的游戏服务器地址');
      return;
    }

    stopHeartbeat();

    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }

    currentRoomId = normalizedRoomId;

    let socket: WebSocket;
    try {
      socket = new WebSocket(buildSocketUrl(base, normalizedRoomId, clientId));
    } catch (error) {
      if (baseIndex + 1 < candidateBases.length) {
        connectWithFallback(normalizedRoomId, baseIndex + 1);
        return;
      }
      reportConnectError(error instanceof Error ? error.message : '无法创建 WebSocket 连接');
      return;
    }

    ws = socket;
    let opened = false;
    let failedBeforeOpen = false;

    socket.onopen = () => {
      if (token !== activeAttemptToken || ws !== socket) {
        socket.close();
        return;
      }

      opened = true;
      connected = true;
      emitLocal('connect');
      flushQueue();

      if (typeof window !== 'undefined') {
        stopHeartbeat();
        heartbeatTimer = window.setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      }
    };

    const failBeforeOpen = (message: string) => {
      if (opened || failedBeforeOpen || token !== activeAttemptToken || ws !== socket) {
        return;
      }

      failedBeforeOpen = true;
      connected = false;
      stopHeartbeat();

      if (baseIndex + 1 < candidateBases.length) {
        connectWithFallback(normalizedRoomId, baseIndex + 1);
        return;
      }

      reportConnectError(message);
    };

    socket.onerror = () => {
      const isPrimary = baseIndex === 0;
      failBeforeOpen(isPrimary && candidateBases.length > 1
        ? '直连 Worker 失败，已尝试 Pages 同源代理，但仍无法连接'
        : '无法连接到游戏服务器');
    };

    socket.onclose = () => {
      if (token !== activeAttemptToken || ws !== socket) {
        return;
      }

      if (!opened) {
        const isPrimary = baseIndex === 0;
        failBeforeOpen(isPrimary && candidateBases.length > 1
          ? '直连 Worker 失败，已尝试 Pages 同源代理，但仍无法连接'
          : '无法连接到游戏服务器');
        return;
      }

      connected = false;
      stopHeartbeat();
      emitLocal('disconnect');
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        normalizeIncomingMessage(message, emitLocal);
      } catch (error) {
        console.error('解析消息失败:', error);
      }
    };
  };

  const sendOrQueue = (message: QueuedMessage) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      sendQueue.push(message);
      return;
    }

    ws.send(JSON.stringify(message));
  };

  return {
    get id() {
      return clientId;
    },

    get connected() {
      return connected;
    },

    emit(event: OutgoingEvent, ...args: any[]) {
      if (event === 'joinRoom') {
        const roomId = normalizeRoomId(args[0] ?? null);
        connectWithFallback(roomId, 0);
        sendOrQueue({
          type: event,
          payload: buildPayload(event, args, clientId),
        });
        return;
      }

      if (!ws) {
        console.warn('Socket 尚未连接房间，忽略消息:', event);
        return;
      }

      sendOrQueue({
        type: event,
        payload: buildPayload(event, args, clientId),
      });
    },

    on(event: EventName, handler: EventHandler) {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(handler);
      return this;
    },

    off(event: EventName, handler?: EventHandler) {
      const handlers = listeners.get(event);
      if (!handlers) {
        return this;
      }

      if (handler) {
        handlers.delete(handler);
      } else {
        handlers.clear();
      }
      return this;
    },

    disconnect() {
      stopHeartbeat();
      connected = false;
      currentRoomId = null;
      activeAttemptToken += 1;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
      ws = null;
    },
  };
}
