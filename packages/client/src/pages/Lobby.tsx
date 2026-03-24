/**
 * 花见小路 - 大厅页面
 * 玩家输入名称并加入/创建房间
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useSocket } from '../hooks';
import { JoinRoomResponse, RoomPlayer, GameState } from '@hanamikoji/shared';

interface LobbyProps {
  onGameStart: (state: GameState, playerId: 'p1' | 'p2', roomId: string) => void;
  savedRoomId: string | null;
  savedPlayerId: 'p1' | 'p2' | null;
}

export const Lobby: React.FC<LobbyProps> = ({ onGameStart, savedRoomId, savedPlayerId }) => {
  const socket = useSocket();
  const [playerName, setPlayerName] = useState(savedPlayerId ? (savedPlayerId === 'p1' ? '玩家1' : '玩家2') : '');
  const [roomCode, setRoomCode] = useState(savedRoomId || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 处理加入房间
  const handleJoinRoom = useCallback((existingRoomId: string | null) => {
    if (!socket) {
      setError('正在连接服务器，请稍候...');
      return;
    }
    
    if (!playerName.trim()) {
      setError('请输入您的名称');
      return;
    }

    setIsLoading(true);
    setError(null);

    socket.emit('joinRoom', existingRoomId, playerName.trim(), (response: JoinRoomResponse) => {
      setIsLoading(false);

      if (response.success && response.roomId) {
        console.log('加入房间成功:', response.roomId);
        setRoomCode(response.roomId);
        setIsWaiting(true);
        setStatus(`已加入房间 ${response.roomId}，等待对手加入...`);
      } else {
        setError(response.message || '加入房间失败');
      }
    });
  }, [socket, playerName]);

  // 监听玩家加入事件
  useEffect(() => {
    if (!socket) return;

    const handlePlayerJoined = (player: RoomPlayer) => {
      console.log('玩家加入:', player);
      setStatus(`玩家 ${player.name} 已加入，游戏即将开始...`);
    };

    const handleGameStarted = (state: GameState, playerId: 'p1' | 'p2') => {
      setIsWaiting(false);
      setStatus(null);
      onGameStart(state, playerId, state.roomId);
    };

    const handleError = (message: string) => {
      setError(message);
      setIsLoading(false);
      setIsWaiting(false);
      setStatus(null);
    };

    socket.on('playerJoined', handlePlayerJoined);
    socket.on('gameStarted', handleGameStarted);
    socket.on('error', handleError);

    return () => {
      socket.off('playerJoined', handlePlayerJoined);
      socket.off('gameStarted', handleGameStarted);
      socket.off('error', handleError);
    };
  }, [socket, playerName, onGameStart]);

  // 创建新房间
  const handleCreateRoom = () => {
    handleJoinRoom(null);
  };

  // 加入指定房间
  const handleJoinExistingRoom = () => {
    if (!roomCode.trim()) {
      setError('请输入房间号');
      return;
    }
    handleJoinRoom(roomCode.trim().toUpperCase());
  };

  return (
    <div className="min-h-screen bg-game-bg flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* 标题 */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-serif text-game-primary mb-2">花见小路</h1>
          <p className="text-gray-500">双人在线卡牌对战</p>
        </div>

        {/* 输入区域 */}
        <div className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
          {/* 玩家名称 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              您的名称
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="请输入名称"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-game-primary focus:border-transparent outline-none transition-all"
              disabled={isLoading || isWaiting}
              maxLength={12}
            />
          </div>

          {/* 房间号（可选） */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              房间号（可选）
            </label>
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="输入房间号加入现有房间"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-game-primary focus:border-transparent outline-none transition-all uppercase"
              disabled={isLoading || isWaiting}
              maxLength={6}
            />
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* 房间与等待状态 */}
          {roomCode.trim() && status && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
              <div className="font-medium">房间号：<span className="font-mono">{roomCode}</span></div>
              <div className="mt-1">{status}</div>
            </div>
          )}
          {roomCode.trim() && !status && savedRoomId && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm">
              <div className="font-medium">房间号：<span className="font-mono">{roomCode}</span></div>
            </div>
          )}

          {/* 按钮组 */}
          <div className="space-y-3 pt-4">
            <button
              onClick={handleCreateRoom}
              disabled={isLoading || isWaiting || !playerName.trim()}
              className={`w-full py-3 rounded-xl font-medium transition-all ${
                isLoading || isWaiting || !playerName.trim()
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-game-primary text-white hover:bg-opacity-90 active:scale-95'
              }`}
            >
              {isLoading ? '正在加入...' : (isWaiting ? '等待对手加入...' : '开始游戏（自动匹配）')}
            </button>

            {roomCode.trim() && (
              <button
                onClick={handleJoinExistingRoom}
                disabled={isLoading || isWaiting || !playerName.trim()}
                className={`w-full py-3 rounded-xl font-medium transition-all ${
                  isLoading || isWaiting || !playerName.trim()
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-game-secondary text-white hover:bg-opacity-90 active:scale-95'
                }`}
              >
                加入房间 {roomCode}
              </button>
            )}
          </div>
        </div>

        {/* 游戏规则简介 */}
        <div className="mt-8 bg-white/50 rounded-xl p-4 text-sm text-gray-600">
          <h3 className="font-medium text-gray-800 mb-2">游戏规则</h3>
          <ul className="space-y-1">
            <li>• 2人轮流抽取卡牌并执行行动</li>
            <li>• 四种行动：密约、取舍、赠予、竞争</li>
            <li>• 控制艺伎或累计足够魅力值即可获胜</li>
            <li>• 最多进行3局比赛</li>
          </ul>
        </div>

        {/* 连接状态 */}
        <div className="mt-4 text-center text-xs text-gray-400">
          服务器连接中...
        </div>
      </div>
    </div>
  );
};
