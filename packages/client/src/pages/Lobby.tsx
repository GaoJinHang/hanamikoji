/**
 * 花见小路 - 大厅页面
 * 玩家输入名称并加入/创建房间
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useIsConnected, useSocket } from '../hooks';
import type { JoinRoomResponse, PlayerId, RoomPlayer } from '@hanamikoji/shared';

interface LobbyProps {
  savedRoomId: string | null;
  savedPlayerId: PlayerId | null;
}

export const Lobby: React.FC<LobbyProps> = ({ savedRoomId, savedPlayerId }) => {
  const socket = useSocket();
  const isConnected = useIsConnected();
  const [playerName, setPlayerName] = useState(savedPlayerId ? (savedPlayerId === 'p1' ? '玩家1' : '玩家2') : '');
  const [roomCode, setRoomCode] = useState(savedRoomId || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // SocketProvider 会在连接或自动重连时使用本地 token 尝试恢复游戏。

  // 处理加入房间
  const handleJoinRoom = useCallback((existingRoomId: string | null) => {
    if (!socket || !isConnected) {
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
        setRoomCode(response.roomId);
        setIsWaiting(true);
        setStatus(`已加入房间 ${response.roomId}，等待对手加入...`);
      } else {
        setError(response.message || '加入房间失败');
      }
    });
  }, [socket, isConnected, playerName]);

  // 监听大厅级事件；游戏状态更新由 SocketProvider 统一分发给 App。
  useEffect(() => {
    if (!socket) return;

    const handlePlayerJoined = (player: RoomPlayer) => {
      setStatus(`玩家 ${player.name} 已加入，游戏即将开始...`);
    };

    const handleError = (message: string) => {
      setError(message);
      setIsLoading(false);
      setIsWaiting(false);
      setStatus(null);
    };

    socket.on('playerJoined', handlePlayerJoined);
    socket.on('error', handleError);

    return () => {
      socket.off('playerJoined', handlePlayerJoined);
      socket.off('error', handleError);
    };
  }, [socket]);

  const handleCreateRoom = () => {
    handleJoinRoom(null);
  };

  const handleJoinExistingRoom = () => {
    if (!roomCode.trim()) {
      setError('请输入房间号');
      return;
    }
    handleJoinRoom(roomCode.trim().toUpperCase());
  };

  const isJoinDisabled = isLoading || isWaiting || !isConnected || !playerName.trim();

  return (
    <div className="min-h-screen bg-game-bg flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-serif text-game-primary mb-2">花见小路</h1>
          <p className="text-gray-500">双人在线卡牌对战</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">您的名称</label>
            <input
              type="text"
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              placeholder="请输入名称"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-game-primary focus:border-transparent outline-none transition-all"
              disabled={isLoading || isWaiting}
              maxLength={12}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">房间号（可选）</label>
            <input
              type="text"
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
              placeholder="输入房间号加入现有房间"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-game-primary focus:border-transparent outline-none transition-all uppercase"
              disabled={isLoading || isWaiting}
              maxLength={6}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

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

          <div className="space-y-3 pt-4">
            <button
              onClick={handleCreateRoom}
              disabled={isJoinDisabled}
              className={`w-full py-3 rounded-xl font-medium transition-all ${
                isJoinDisabled
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-game-primary text-white hover:bg-opacity-90 active:scale-95'
              }`}
            >
              {isLoading ? '正在加入...' : (isWaiting ? '等待对手加入...' : '开始游戏（自动匹配）')}
            </button>

            {roomCode.trim() && (
              <button
                onClick={handleJoinExistingRoom}
                disabled={isJoinDisabled}
                className={`w-full py-3 rounded-xl font-medium transition-all ${
                  isJoinDisabled
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-game-secondary text-white hover:bg-opacity-90 active:scale-95'
                }`}
              >
                加入房间 {roomCode}
              </button>
            )}
          </div>
        </div>

        <div className="mt-8 bg-white/50 rounded-xl p-4 text-sm text-gray-600">
          <h3 className="font-medium text-gray-800 mb-2">游戏规则</h3>
          <ul className="space-y-1">
            <li>• 2人轮流抽取卡牌并执行行动</li>
            <li>• 四种行动：密约、取舍、赠予、竞争</li>
            <li>• 控制艺伎或累计足够魅力值即可获胜</li>
            <li>• 最多进行3局比赛</li>
          </ul>
        </div>

        <div className="mt-4 text-center text-xs text-gray-400">
          {isConnected ? '服务器已连接' : '服务器连接中...'}
        </div>
      </div>
    </div>
  );
};
