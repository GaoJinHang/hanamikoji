/**
 * 花见小路 - Socket 连接管理
 * 使用 React Context 模式
 */

// 使用默认导入并重命名，避免与局部变量冲突
import { io as socketIO, Socket } from 'socket.io-client';
import { ServerToClientEvents, ClientToServerEvents, GameState } from '@hanamikoji/shared';

// Socket 类型定义
export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * 获取 Socket 服务器地址
 */
function getSocketUrl(): string {
  // 优先使用环境变量
  if (import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL;
  }
  
  // 生产环境使用当前域名
  if (import.meta.env.PROD) {
    return window.location.origin;
  }
  
  // 开发环境使用 localhost:3001
  return 'http://localhost:3001';
}

/**
 * 创建 Socket 连接
 * 注意：此函数由 SocketProvider 调用，不应在其他地方直接使用
 */
export function createSocket(): TypedSocket {
  const socketUrl = getSocketUrl();
  console.log(`🔌 初始化 Socket 连接: ${socketUrl}`);
  
  // 使用 socketIO() 创建连接（避免与变量名 socket 冲突）
  const socket = socketIO(socketUrl, {
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('✅ Socket 连接成功:', socket.id);
  });

  socket.on('connect_error', (error) => {
    console.error('❌ Socket 连接错误:', error.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 Socket 断开连接:', reason);
  });

  return socket;
}

/**
 * 派发游戏状态更新事件
 */
export function dispatchGameStateUpdate(state: GameState): void {
  window.dispatchEvent(new CustomEvent('hanamikoji_gameStateUpdate', { detail: state }));
}

/**
 * 派发游戏开始事件
 */
export function dispatchGameStarted(state: GameState, playerId: 'p1' | 'p2'): void {
  window.dispatchEvent(
    new CustomEvent('hanamikoji_gameStarted', { detail: { state, playerId, roomId: state.roomId } })
  );
}

/**
 * 派发游戏结束事件
 */
export function dispatchGameOver(): void {
  window.dispatchEvent(new CustomEvent('hanamikoji_gameOver'));
}
