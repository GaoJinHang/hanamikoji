/**
 * 花见小路 - 根组件
 * 根据游戏状态显示大厅或游戏页面。
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SocketProvider, useSocketContext } from './context/SocketContext';
import { Lobby } from './pages/Lobby';
import { Game } from './pages/Game';
import { OnlineSocketConnection } from './connection';
import type { GameConnection, OfflineP2PConnection } from './connection';
import type { GameState, PlayerId } from '@hanamikoji/shared';

const STORAGE_KEYS = {
  roomId: 'hanamikoji_roomId',
  playerId: 'hanamikoji_playerId',
  reconnectToken: 'hanamikoji_reconnectToken',
} as const;

function isPlayerId(value: string | null): value is PlayerId {
  return value === 'p1' || value === 'p2';
}

function AppContent() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<PlayerId | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [offlineConnection, setOfflineConnection] = useState<OfflineP2PConnection | null>(null);
  const [, setOfflineRenderTick] = useState(0);
  const { socket, isConnected } = useSocketContext();

  const handleGameStart = useCallback((state: GameState, pid: PlayerId, rid: string, token: string) => {
    offlineConnection?.leaveRoom();
    setOfflineConnection(null);
    setGameState(state);
    setPlayerId(pid);
    setRoomId(rid);
    localStorage.setItem(STORAGE_KEYS.roomId, rid);
    localStorage.setItem(STORAGE_KEYS.playerId, pid);
    localStorage.setItem(STORAGE_KEYS.reconnectToken, token);
  }, [offlineConnection]);

  const handleLeaveGame = useCallback(() => {
    offlineConnection?.leaveRoom();
    setOfflineConnection(null);
    setGameState(null);
    setPlayerId(null);
    setRoomId(null);
    localStorage.removeItem(STORAGE_KEYS.roomId);
    localStorage.removeItem(STORAGE_KEYS.playerId);
    localStorage.removeItem(STORAGE_KEYS.reconnectToken);
  }, [offlineConnection]);

  const handleOfflineGameReady = useCallback((connection: OfflineP2PConnection) => {
    setGameState(null);
    setPlayerId(null);
    setRoomId(connection.gameState.roomId);
    setOfflineConnection(previous => {
      previous?.dispose();
      return connection;
    });
    setOfflineRenderTick(tick => tick + 1);
  }, []);

  const handleOfflineStateChanged = useCallback(() => {
    setOfflineRenderTick(tick => tick + 1);
  }, []);

  useEffect(() => {
    const savedRoomId = localStorage.getItem(STORAGE_KEYS.roomId);
    const savedPlayerId = localStorage.getItem(STORAGE_KEYS.playerId);
    const savedReconnectToken = localStorage.getItem(STORAGE_KEYS.reconnectToken);

    if (savedRoomId && isPlayerId(savedPlayerId) && savedReconnectToken) {
      setRoomId(savedRoomId);
      setPlayerId(savedPlayerId);
    }

    const onGameStarted = (event: Event) => {
      const { state, playerId: nextPlayerId, roomId: nextRoomId, reconnectToken: nextToken } = (event as CustomEvent<{
        state: GameState;
        playerId: PlayerId;
        roomId: string;
        reconnectToken: string;
      }>).detail;
      handleGameStart(state, nextPlayerId, nextRoomId, nextToken);
    };

    const onGameStateUpdate = (event: Event) => {
      setGameState((event as CustomEvent<GameState>).detail);
    };

    window.addEventListener('hanamikoji_gameStarted', onGameStarted);
    window.addEventListener('hanamikoji_gameStateUpdate', onGameStateUpdate);

    return () => {
      window.removeEventListener('hanamikoji_gameStarted', onGameStarted);
      window.removeEventListener('hanamikoji_gameStateUpdate', onGameStateUpdate);
    };
  }, [handleGameStart]);

  const onlineConnection = useMemo(() => {
    if (offlineConnection || !socket || !gameState || !playerId) return null;
    return new OnlineSocketConnection(socket, {
      gameState,
      playerId,
      isConnected,
    });
  }, [offlineConnection, socket, gameState, playerId, isConnected]);

  const gameConnection: GameConnection | null = offlineConnection ?? onlineConnection;

  if (gameConnection) {
    return <Game connection={gameConnection} onLeave={handleLeaveGame} />;
  }

  return (
    <Lobby
      savedRoomId={roomId}
      savedPlayerId={playerId}
      onOfflineGameReady={handleOfflineGameReady}
      onOfflineStateChanged={handleOfflineStateChanged}
    />
  );
}

function App() {
  return (
    <SocketProvider>
      <AppContent />
    </SocketProvider>
  );
}

export default App;
