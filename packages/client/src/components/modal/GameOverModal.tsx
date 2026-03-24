/**
 * 花见小路 - 游戏结束模态框组件
 * 显示游戏结果和得分
 */

import React from 'react';
import { PlayerId } from '@hanamikoji/shared';

interface GameOverModalProps {
  isOpen: boolean;
  gameOverData: {
    winner: PlayerId | null;
    isDraw: boolean;
    reason: string;
    finalScores: {
      p1: { geishaCount: number; totalCharm: number };
      p2: { geishaCount: number; totalCharm: number };
    };
  } | null;
  playerId: PlayerId;
  onClose: () => void;
}

/**
 * 获取结果消息
 */
function getResultMessage(data: GameOverModalProps['gameOverData'], playerId: PlayerId): {
  title: string;
  message: string;
  emoji: string;
} {
  if (!data) {
    return { title: '游戏结束', message: '', emoji: '🎮' };
  }

  if (data.isDraw) {
    return { 
      title: '平局！', 
      message: '势均力敌，不分胜负',
      emoji: '🤝' 
    };
  }

  const isWin = data.winner === playerId;
  return {
    title: isWin ? '🎉 胜利！' : '💔 失败',
    message: isWin 
      ? `恭喜你获得了胜利！${data.reason}`
      : `对手获胜。${data.reason}`,
    emoji: isWin ? '🏆' : '😢',
  };
}

export const GameOverModal: React.FC<GameOverModalProps> = ({ 
  isOpen, 
  gameOverData, 
  playerId, 
  onClose 
}) => {
  if (!isOpen || !gameOverData) return null;

  const result = getResultMessage(gameOverData, playerId);
  const isWin = gameOverData.winner === playerId;
  const isDraw = gameOverData.isDraw;

  return (
    <div className="modal-overlay">
      <div className="modal-content p-6 max-w-sm mx-4">
        {/* 结果标题 */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">{result.emoji}</div>
          <h2 className={`text-2xl font-bold ${isWin ? 'text-game-primary' : isDraw ? 'text-gray-600' : 'text-gray-400'}`}>
            {result.title}
          </h2>
          <p className="text-sm text-gray-500 mt-1">{result.message}</p>
        </div>

        {/* 得分对比 */}
        <div className="bg-gray-50 rounded-xl p-4 mb-6">
          <div className="text-center text-xs text-gray-500 mb-3">最终得分</div>
          
          {/* 玩家1 */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                gameOverData.winner === 'p1' ? 'bg-game-primary' : 'bg-gray-400'
              }`}>
                P1
              </div>
              <span className="font-medium">{isWin && playerId === 'p1' ? '你' : '对手'}</span>
            </div>
            <div className="text-right">
              <div className="font-bold text-lg">{gameOverData.finalScores.p1.totalCharm} 分</div>
              <div className="text-xs text-gray-400">{gameOverData.finalScores.p1.geishaCount} 艺伎</div>
            </div>
          </div>

          {/* 分隔线 */}
          <div className="border-t border-gray-200 my-2"></div>

          {/* 玩家2 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                gameOverData.winner === 'p2' ? 'bg-game-primary' : 'bg-gray-400'
              }`}>
                P2
              </div>
              <span className="font-medium">{isWin && playerId === 'p2' ? '你' : '对手'}</span>
            </div>
            <div className="text-right">
              <div className="font-bold text-lg">{gameOverData.finalScores.p2.totalCharm} 分</div>
              <div className="text-xs text-gray-400">{gameOverData.finalScores.p2.geishaCount} 艺伎</div>
            </div>
          </div>
        </div>

        {/* 重新开始按钮 */}
        <button
          onClick={onClose}
          className="w-full py-3 bg-game-primary text-white rounded-xl font-medium hover:bg-opacity-90 active:scale-95 transition-all"
        >
          再来一局
        </button>
      </div>
    </div>
  );
};
