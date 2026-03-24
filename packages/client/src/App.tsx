/**
 * 花见小路 - 根组件
 * 根据游戏状态显示不同的页面
 */

import React, { useState, useEffect } from 'react';
import { SocketProvider } from './context/SocketContext';
import { Lobby } from './pages/Lobby';
import { Game } from './pages/Game';
import { GameState, RoomPlayer } from '@hanamikoji/shared';

function AppContent() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<'p1' | 'p2' | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);

  useEffect(() => {
    // 监听游戏开始事件
    const handleGameStarted = (payload: { state: GameState; playerId: 'p1' | 'p2'; roomId: string }) => {
      handleGameStart(payload.state, payload.playerId, payload.roomId);
    };

    // 监听游戏状态更新
    const handleGameStateUpdate = (state: GameState) => {
      setGameState(state);
    };

    // 监听游戏结束
    const handleGameOver = () => {
      setGameState(null);
      setPlayerId(null);
      setRoomId(null);
    };

    // 从 localStorage 恢复游戏状态
    const savedRoomId = localStorage.getItem('hanamikoji_roomId');
    const savedPlayerId = localStorage.getItem('hanamikoji_playerId') as 'p1' | 'p2' | null;
    
    if (savedRoomId && savedPlayerId) {
      setRoomId(savedRoomId);
      setPlayerId(savedPlayerId);
    }

    // 添加事件监听器（通过 window 事件总线实现组件间通信）
    window.addEventListener('hanamikoji_gameStarted', ((e: CustomEvent) => {
      handleGameStarted(e.detail);
    }) as EventListener);
    
    window.addEventListener('hanamikoji_gameStateUpdate', ((e: CustomEvent) => {
      handleGameStateUpdate(e.detail);
    }) as EventListener);
    
    window.addEventListener('hanamikoji_gameOver', (() => {
      handleGameOver();
    }) as EventListener);

    return () => {
      window.removeEventListener('hanamikoji_gameStarted', (handleGameStarted as any));
      window.removeEventListener('hanamikoji_gameStateUpdate', (handleGameStateUpdate as any));
      window.removeEventListener('hanamikoji_gameOver', handleGameOver);
    };
  }, []);

  const handleGameStart = (state: GameState, pid: 'p1' | 'p2', rid: string) => {
    setGameState(state);
    setPlayerId(pid);
    setRoomId(rid);
    localStorage.setItem('hanamikoji_roomId', rid);
    localStorage.setItem('hanamikoji_playerId', pid);
  };

  const handleLeaveGame = () => {
    setGameState(null);
    setPlayerId(null);
    setRoomId(null);
    localStorage.removeItem('hanamikoji_roomId');
    localStorage.removeItem('hanamikoji_playerId');
  };

  // 如果有游戏状态，显示游戏页面
  if (gameState) {
    return <Game gameState={gameState} playerId={playerId!} onLeave={handleLeaveGame} />;
  }

  // 否则显示大厅页面
  return <Lobby onGameStart={handleGameStart} savedRoomId={roomId} savedPlayerId={playerId} />;
}

function App() {
  return (
    <SocketProvider>
      <AppContent />
    </SocketProvider>
  );
}

export default App;
