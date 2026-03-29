/**
 * 花见小路 - Socket 连接管理
 * 使用 WebSocket wrapper 兼容 emit/on 风格接口
 */

import type { GameState, ServerToClientEvents, ClientToServerEvents } from '@hanamikoji/shared';
import { createSocketClient, type SocketClient } from '../network/createSocketClient';

export type TypedSocket = SocketClient & {
  emit(event: keyof ClientToServerEvents | 'leaveRoom' | 'ping', ...args: any[]): void;
  on(event: keyof ServerToClientEvents | 'connect' | 'disconnect' | 'connect_error' | 'roomJoined', handler: (...args: any[]) => void): TypedSocket;
  off(event: keyof ServerToClientEvents | 'connect' | 'disconnect' | 'connect_error' | 'roomJoined', handler?: (...args: any[]) => void): TypedSocket;
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

  socket.on('disconnect', (reason) => {
    console.log('🔌 Socket 断开连接:', reason);
  });

  return socket;
}

export function dispatchGameStateUpdate(state: GameState): void {
  window.dispatchEvent(new CustomEvent('hanamikoji_gameStateUpdate', { detail: state }));
}

export function dispatchGameStarted(state: GameState, playerId: 'p1' | 'p2'): void {
  window.dispatchEvent(
    new CustomEvent('hanamikoji_gameStarted', { detail: { state, playerId, roomId: state.roomId } }),
  );
}

export function dispatchGameOver(): void {
  window.dispatchEvent(new CustomEvent('hanamikoji_gameOver'));
}
