/**
 * 花见小路 - Socket Context
 * 使用 React Context 模式管理 Socket 连接
 */

import React, { createContext, useEffect, useState, useRef, ReactNode, useContext } from 'react';
import { TypedSocket, createSocket, dispatchGameStateUpdate, dispatchGameStarted, dispatchGameOver } from './socket';
import { GameState } from '@hanamikoji/shared';

// Context 类型定义
interface SocketContextType {
  socket: TypedSocket | null;
  isConnected: boolean;
  isInitialized: boolean;
}

// 创建 Context，初始值为 null
const SocketContext = createContext<SocketContextType | undefined>(undefined);

/**
 * Socket Provider 组件
 * 在应用顶层使用，负责管理 Socket 生命周期
 */
interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [contextValue, setContextValue] = useState<SocketContextType>({
    socket: null,
    isConnected: false,
    isInitialized: false,
  });

  // 使用 ref 保持 socket 实例的稳定性
  const socketRef = useRef<TypedSocket | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    // 防止重复初始化
    if (initializedRef.current) {
      return;
    }

    console.log('🔌 SocketProvider: 开始初始化 Socket...');

    // 创建 Socket 连接
    const socket = createSocket();
    socketRef.current = socket;

    // 更新连接状态
    const updateConnection = (connected: boolean) => {
      setContextValue(prev => ({
        ...prev,
        isConnected: connected,
        isInitialized: true,
      }));
    };

    // 监听连接事件
    const handleConnect = () => {
      console.log('✅ SocketProvider: 连接建立');
      updateConnection(true);
    };

    const handleDisconnect = (reason: string) => {
      console.log('🔌 SocketProvider: 断开连接 -', reason);
      updateConnection(false);
    };

    const handleConnectError = (error: Error) => {
      console.error('❌ SocketProvider: 连接错误 -', error.message);
      // 仍然标记为已初始化，只是连接失败
      setContextValue(prev => ({
        ...prev,
        isInitialized: true,
      }));
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);

    // 监听游戏事件并分发到全局
    const handleGameStateUpdate = (state: GameState) => {
      dispatchGameStateUpdate(state);
    };

    const handleGameStarted = (state: GameState, playerId: 'p1' | 'p2') => {
      dispatchGameStarted(state, playerId);
    };

    const handleGameOverEvent = () => {
      dispatchGameOver();
    };

    socket.on('gameStateUpdate', handleGameStateUpdate);
    socket.on('gameStarted', handleGameStarted);
    socket.on('gameOver', handleGameOverEvent);

    // 立即更新 context 中的 socket
    setContextValue(prev => ({
      ...prev,
      socket: socket,
      isInitialized: true,
    }));

    initializedRef.current = true;

    // 清理函数
    return () => {
      console.log('🔌 SocketProvider: 清理中...');
      socket.off('gameStateUpdate', handleGameStateUpdate);
      socket.off('gameStarted', handleGameStarted);
      socket.off('gameOver', handleGameOverEvent);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.disconnect();
      socketRef.current = null;
      initializedRef.current = false;
    };
  }, []);

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
};

/**
 * 使用 Socket 的 Hook
 * 必须在 SocketProvider 内部使用
 */
export function useSocket(): TypedSocket {
  const context = useContext(SocketContext);

  if (context === undefined) {
    throw new Error('useSocket 必须在 SocketProvider 内部使用');
  }

  // 如果 socket 还未初始化，返回 null 让调用者处理
  if (!context.socket || !context.isInitialized) {
    console.warn('useSocket: Socket 还未初始化完成');
    // 返回 null 而不是抛出错误，让组件在 useEffect 中处理
    return null as unknown as TypedSocket;
  }

  return context.socket;
}

/**
 * 获取完整的 Context 值
 */
export function useSocketContext(): SocketContextType {
  const context = useContext(SocketContext);

  if (context === undefined) {
    throw new Error('useSocketContext 必须在 SocketProvider 内部使用');
  }

  return context;
}

/**
 * 检查连接状态
 */
export function useIsConnected(): boolean {
  const context = useContext(SocketContext);

  if (context === undefined) {
    throw new Error('useIsConnected 必须在 SocketProvider 内部使用');
  }

  return context.isConnected;
}
