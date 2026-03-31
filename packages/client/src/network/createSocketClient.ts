import type { ClientToServerEvents, JoinRoomResponse, ServerToClientEvents } from '@hanamikoji/shared';

type EventName = keyof ServerToClientEvents | 'connect' | 'disconnect' | 'connect_error' | 'roomJoined';
type EventHandler = (...args: any[]) => void;

export interface SocketClient {
  readonly id: string;
  readonly connected: boolean;
  emit(event: keyof ClientToServerEvents | 'leaveRoom' | 'ping', ...args: any[]): void;
  on(event: EventName, handler: EventHandler): this;
  off(event: EventName, handler?: EventHandler): this;
  disconnect(): void;
}

function randomClientId(): string {
  // 为每个连接会话生成唯一的ID，而不是依赖于持久化存储
  // 这样可以确保同一个浏览器中的不同标签页有不同的clientPlayerId
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createSocketClient(url?: string): SocketClient {
  // 根据主机名动态选择 WebSocket 连接地址
  const wsUrl = url || (typeof window !== 'undefined' 
    ? (window.location.hostname === "localhost" 
        ? "ws://localhost:8787" 
        : "wss://hanamikoji-server.g404338082.workers.dev")
    : "ws://localhost:8787");
  
  const clientId = randomClientId();
  const listeners = new Map<string, Set<EventHandler>>();
  let connected = false;
  let joinRoomCallback: ((response: JoinRoomResponse) => void) | null = null;
  let heartbeatTimer: number | null = null;
  const ws = new WebSocket(wsUrl);

  const emitLocal = (event: string, ...args: any[]) => {
    const handlers = listeners.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      handler(...args);
    }
  };

  const startHeartbeat = () => {
    stopHeartbeat();
    heartbeatTimer = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);
  };

  const stopHeartbeat = () => {
    if (heartbeatTimer !== null) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  ws.addEventListener('open', () => {
    connected = true;
    emitLocal('connect');
    startHeartbeat();
  });

  ws.addEventListener('close', () => {
    connected = false;
    stopHeartbeat();
    emitLocal('disconnect', 'websocket closed');
  });

  ws.addEventListener('error', (event) => {
    emitLocal('connect_error', event);
  });

  ws.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(String(event.data)) as { type: string; payload?: any };

      switch (message.type) {
        case 'pong':
          return;
        case 'roomJoined':
          joinRoomCallback?.(message.payload as JoinRoomResponse);
          emitLocal('roomJoined', message.payload);
          return;
        case 'playerJoined':
          emitLocal('playerJoined', message.payload);
          return;
        case 'playerLeft':
          emitLocal('playerLeft', message.payload.playerId);
          return;
        case 'gameStarted':
          emitLocal('gameStarted', message.payload.state, message.payload.playerId);
          return;
        case 'stateSync':
          emitLocal('gameStateUpdate', message.payload);
          return;
        case 'phaseChanged':
          emitLocal('phaseChanged', message.payload.phase, message.payload.activePlayer);
          return;
        case 'choiceRequired':
          emitLocal('choiceRequired', message.payload);
          return;
        case 'actionRequired':
          emitLocal('actionRequired', message.payload.type, message.payload.minCards, message.payload.maxCards);
          return;
        case 'gameOver':
          emitLocal('gameOver', message.payload);
          return;
        case 'opponentDisconnected':
          emitLocal('opponentDisconnected');
          return;
        case 'opponentReconnected':
          emitLocal('opponentReconnected');
          return;
        case 'error':
          emitLocal('error', message.payload?.message || 'Unknown error');
          return;
        default:
          console.warn('[socket-client] unknown message', message.type);
      }
    } catch (error) {
      console.error('[socket-client] failed to parse message', error);
    }
  });

  const client: SocketClient = {
    get id() {
      return clientId;
    },
    get connected() {
      return connected;
    },
    emit(event, ...args) {
      if (ws.readyState !== WebSocket.OPEN) {
        emitLocal('connect_error', new Error('Socket is not connected'));
        return;
      }

      switch (event) {
        case 'joinRoom': {
          const [roomId, playerName, callback] = args as [string | null, string, ((response: JoinRoomResponse) => void)?];
          joinRoomCallback = callback ?? null;
          ws.send(JSON.stringify({
            type: 'joinRoom',
            payload: {
              roomId: roomId ?? '',
              playerId: clientId,
              name: playerName,
            },
          }));
          return;
        }
        case 'drawCard':
          ws.send(JSON.stringify({ type: 'drawCard' }));
          return;
        case 'playAction':
          ws.send(JSON.stringify({ type: 'playAction', payload: args[0] }));
          return;
        case 'resolveAction':
          ws.send(JSON.stringify({ type: 'resolveAction', payload: { selection: args[0] } }));
          return;
        case 'leaveRoom':
          ws.send(JSON.stringify({ type: 'leaveRoom' }));
          return;
        case 'ping':
          ws.send(JSON.stringify({ type: 'ping' }));
          return;
        case 'startGame':
        case 'cancelAction':
        case 'reconnect':
          console.warn(`[socket-client] ${event} is kept as a compatibility no-op`);
          return;
        default:
          console.warn(`[socket-client] unsupported emit event: ${String(event)}`);
      }
    },
    on(event, handler) {
      const handlers = listeners.get(event) ?? new Set<EventHandler>();
      handlers.add(handler);
      listeners.set(event, handlers);
      return this;
    },
    off(event, handler) {
      if (!handler) {
        listeners.delete(event);
        return this;
      }
      listeners.get(event)?.delete(handler);
      return this;
    },
    disconnect() {
      stopHeartbeat();
      ws.close();
    },
  };

  return client;
}
