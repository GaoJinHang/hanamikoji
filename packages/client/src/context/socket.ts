/**
 * 花见小路 - Socket 连接管理
 * 使用 React Context 模式
 */

// 使用默认导入并重命名，避免与局部变量冲突
import { io as socketIO } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, GameState, PlayerId, ServerToClientEvents } from '@hanamikoji/shared';

// Socket 类型定义
export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * 获取 Socket 服务器地址
 */
function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * 获取 Socket / API 服务器地址
 *
 * 生产环境部署到 Cloudflare Pages 时，请在 Pages 环境变量中设置：
 * VITE_SOCKET_URL=https://api.your-domain.com
 *
 * 也兼容 VITE_API_BASE_URL，方便后续把 HTTP API 与 Socket 服务统一到一个后端域名。
 */
export function hasExplicitSocketBackend(): boolean {
  return Boolean((import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_BASE_URL)?.trim());
}

function getSocketUrl(): string {
  const envUrl = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_BASE_URL;

  // 优先使用环境变量。Cloudflare Pages / Vite 只会把 VITE_ 开头的变量打进前端包。
  if (envUrl) {
    return normalizeUrl(envUrl);
  }

  // 生产环境如果没有配置环境变量，默认使用当前域名。
  // 注意：当前端在 Cloudflare Pages、后端在云服务器时，必须显式配置 VITE_SOCKET_URL。
  if (import.meta.env.PROD) {
    return window.location.origin;
  }

  // 开发环境使用本地后端
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
export function dispatchGameStarted(state: GameState, playerId: PlayerId, reconnectToken: string): void {
  window.dispatchEvent(
    new CustomEvent('hanamikoji_gameStarted', { detail: { state, playerId, roomId: state.roomId, reconnectToken } })
  );
}
