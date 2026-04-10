/**
 * 花见小路 - 根组件
 * 根据游戏状态显示不同的页面
 */

import React, { useEffect, useState } from 'react';
import { SocketProvider } from './context/SocketContext';
import { useSocket } from './hooks';
import { Lobby } from './pages/Lobby';
import { Game } from './pages/Game';
import type { GameState } from '@hanamikoji/shared';

function AppContent() {
  const socket = useSocket();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<'p1' | 'p2' | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    return (window.sessionStorage.getItem('hanamikoji_playerId') as 'p1' | 'p2' | null) ?? null;
  });
  const [roomId, setRoomId] = useState<string | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    return window.sessionStorage.getItem('hanamikoji_roomId');
  });

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleGameStarted = (state: GameState, pid: 'p1' | 'p2') => {
      setGameState(state);
      setPlayerId(pid);
      setRoomId(state.roomId);
      window.sessionStorage.setItem('hanamikoji_roomId', state.roomId);
      window.sessionStorage.setItem('hanamikoji_playerId', pid);
    };

    const handleStateSync = (state: GameState) => {
      setGameState(state);
    };

    const handleGameOver = () => {
      setGameState(null);
      setPlayerId(null);
      setRoomId(null);
      window.sessionStorage.removeItem('hanamikoji_roomId');
      window.sessionStorage.removeItem('hanamikoji_playerId');
    };

    socket.on('gameStarted', handleGameStarted);
    socket.on('stateSync', handleStateSync);
    socket.on('gameOver', handleGameOver);

    return () => {
      socket.off('gameStarted', handleGameStarted);
      socket.off('stateSync', handleStateSync);
      socket.off('gameOver', handleGameOver);
    };
  }, [socket]);

  const handleLeaveGame = () => {
    setGameState(null);
    setPlayerId(null);
    setRoomId(null);
    window.sessionStorage.removeItem('hanamikoji_roomId');
    window.sessionStorage.removeItem('hanamikoji_playerId');
  };

  if (gameState && playerId) {
    return <Game gameState={gameState} playerId={playerId} onLeave={handleLeaveGame} />;
  }

  return <Lobby onGameStart={() => {}} savedRoomId={roomId} savedPlayerId={playerId} />;
}

function App() {
  return (
    <SocketProvider>
      <AppContent />
    </SocketProvider>
  );
}

export default App;
