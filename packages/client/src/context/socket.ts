/**
 * 花见小路 - Socket 连接管理
 * 使用 WebSocket wrapper 兼容 emit/on 风格接口
 */

import type { ServerToClientEvents, ClientToServerEvents } from '@hanamikoji/shared';
import { createSocketClient, type SocketClient } from '../network/createSocketClient';

export type TypedSocket = SocketClient & {
  emit(event: keyof ClientToServerEvents | 'leaveRoom' | 'ping', ...args: any[]): void;
  on(event: keyof ServerToClientEvents | 'connect' | 'disconnect' | 'connect_error' | 'roomJoined' | 'stateSync', handler: (...args: any[]) => void): TypedSocket;
  off(event: keyof ServerToClientEvents | 'connect' | 'disconnect' | 'connect_error' | 'roomJoined' | 'stateSync', handler?: (...args: any[]) => void): TypedSocket;
};

export function createSocket(): TypedSocket {
  const socketUrl = import.meta.env.VITE_SOCKET_URL;
  const socket = createSocketClient(socketUrl) as TypedSocket;

  socket.on('connect', () => {
    console.log('✅ Socket 连接成功:', socket.id);
  });

  socket.on('connect_error', (error) => {
    console.error('❌ Socket 连接错误:', error instanceof Error ? error.message : error);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Socket 断开连接');
  });

  return socket;
}
