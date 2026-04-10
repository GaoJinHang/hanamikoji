/**
 * 花见小路 - Socket Context
 * 使用 React Context 模式管理 Socket 连接
 */

import React, { createContext, useEffect, useMemo, useState, type ReactNode, useContext } from 'react';
import { TypedSocket, createSocket } from './socket';

interface SocketContextType {
  socket: TypedSocket | null;
  isConnected: boolean;
  isInitialized: boolean;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const socket = useMemo(() => createSocket(), []);
  const [isConnected, setIsConnected] = useState(socket.connected);

  useEffect(() => {
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);
    const handleConnectError = () => setIsConnected(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.disconnect();
    };
  }, [socket]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        isInitialized: true,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export function useSocket(): TypedSocket | null {
  const context = useContext(SocketContext);

  if (context === undefined) {
    throw new Error('useSocket 必须在 SocketProvider 内部使用');
  }

  return context.socket;
}

export function useIsConnected(): boolean {
  const context = useContext(SocketContext);

  if (context === undefined) {
    throw new Error('useIsConnected 必须在 SocketProvider 内部使用');
  }

  return context.isConnected;
}

export function useSocketContext(): SocketContextType {
  const context = useContext(SocketContext);

  if (context === undefined) {
    throw new Error('useSocketContext 必须在 SocketProvider 内部使用');
  }

  return context;
}
