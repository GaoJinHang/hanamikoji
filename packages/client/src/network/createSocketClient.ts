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

function normalizeBaseUrl(url?: string): string {
  const fallback = typeof window === 'undefined'
    ? 'ws://localhost:8787'
    : window.location.hostname === 'localhost'
      ? 'ws://localhost:8787'
      : 'wss://hanamikoji-server.g404338082.workers.dev';

  const raw = (url?.trim() || fallback).replace(/\/$/, '');

  if (typeof window === 'undefined') {
    return raw;
  }

  try {
    const resolved = raw.startsWith('/')
      ? new URL(raw, window.location.origin)
      : new URL(raw);

    if (resolved.protocol === 'http:') {
      resolved.protocol = 'ws:';
    } else if (resolved.protocol === 'https:') {
      resolved.protocol = 'wss:';
    }

    return resolved.toString().replace(/\/$/, '');
  } catch {
    return fallback;
  }
}

function buildSocketUrl(baseUrl: string, roomId: string, clientId: string): string {
  const url = new URL(baseUrl);

  if (!url.pathname.endsWith('/ws')) {
    const pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
    url.pathname = `${pathname}/ws`;
  }

  url.searchParams.set('roomId', roomId);
  url.searchParams.set('clientPlayerId', clientId);
  return url.toString();
}

function normalizeRoomId(roomId: string | null | undefined): string {
  const trimmed = roomId?.trim().toUpperCase();
  return trimmed || 'ROOM-001';
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
  const baseUrl = normalizeBaseUrl(url);
  const clientId = getOrCreateClientId();
  const listeners = new Map<string, Set<EventHandler>>();
  const sendQueue: QueuedMessage[] = [];

  let connected = false;
  let currentRoomId: string | null = null;
  let ws: WebSocket | null = null;
  let heartbeatTimer: number | null = null;

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
    if (heartbeatTimer !== null) {
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

  const attachSocketHandlers = (socket: WebSocket) => {
    socket.onopen = () => {
      connected = true;
      emitLocal('connect');
      flushQueue();

      stopHeartbeat();
      heartbeatTimer = window.setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    };

    socket.onclose = () => {
      if (ws !== socket) {
        return;
      }
      connected = false;
      stopHeartbeat();
      emitLocal('disconnect');
    };

    socket.onerror = (event) => {
      emitLocal('connect_error', event);
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

  const connectToRoom = (roomId: string) => {
    const normalizedRoomId = normalizeRoomId(roomId);
    if (ws && currentRoomId === normalizedRoomId && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    stopHeartbeat();

    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }

    currentRoomId = normalizedRoomId;
    const fullUrl = buildSocketUrl(baseUrl, normalizedRoomId, clientId);
    ws = new WebSocket(fullUrl);
    attachSocketHandlers(ws);
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
        connectToRoom(roomId);
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
      sendQueue.length = 0;
      connected = false;
      currentRoomId = null;

      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
      ws = null;
      listeners.clear();
    },
  };
}
