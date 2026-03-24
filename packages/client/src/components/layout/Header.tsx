/**
 * 花见小路 - 顶部信息栏组件
 * 显示对手信息、当前回合状态和局数
 */

import React from 'react';
import { PlayerState } from '@hanamikoji/shared';

interface HeaderProps {
  opponent: PlayerState;
  currentPlayer: PlayerState;
  isMyTurn: boolean;
  phaseName: string;
  round: number;
  maxRounds: number;
  roomId?: string;
}

/**
 * 获取艺伎卡背景色
 */
function getGeishaColor(charm: number): string {
  const colors: Record<number, string> = {
    2: '#FFB6C1',
    3: '#DDA0DD',
    4: '#87CEEB',
    5: '#90EE90',
    6: '#FFA500',
    7: '#FF6347',
    8: '#FFD700',
  };
  return colors[charm] || '#E5E7EB';
}

export const Header: React.FC<HeaderProps> = ({
  opponent,
  currentPlayer,
  isMyTurn,
  phaseName,
  round,
  maxRounds,
  roomId,
}) => {
  return (
    <div className="bg-white border-b border-gray-200 px-4 py-2">
      {/* 局数显示 */}
      <div className="flex justify-center mb-2 gap-2">
        <div className="bg-gray-100 rounded-full px-3 py-1 text-xs text-gray-600">
          第 {round} / {maxRounds} 局
        </div>
        {roomId && (
          <div className="bg-gray-100 rounded-full px-3 py-1 text-xs text-gray-600">
            房间 <span className="font-mono">{roomId}</span>
          </div>
        )}
      </div>

      {/* 玩家信息 */}
      <div className="flex items-center justify-between">
        {/* 对手信息 */}
        <div className={`flex items-center gap-2 ${!isMyTurn ? 'opacity-100' : 'opacity-60'}`}>
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
            style={{ backgroundColor: getGeishaColor(5) }}
          >
            {opponent.name.charAt(0)}
          </div>
          <div>
            <div className="font-medium text-sm">{opponent.name}</div>
            <div className="text-xs text-gray-500">
              手牌 {opponent.hand.length} 张
            </div>
          </div>
          {/* 已使用的行动标记 */}
          <div className="flex gap-1 ml-2">
            {Object.entries(opponent.actionsUsed).map(([key, used]) => (
              <div
                key={key}
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] ${
                  used 
                    ? 'bg-gray-200 text-gray-400' 
                    : 'bg-green-100 text-green-600'
                }`}
                title={key}
              >
                {key.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
        </div>

        {/* 阶段名称 */}
        <div className="text-center">
          <div className={`text-lg font-bold ${isMyTurn ? 'text-game-primary' : 'text-gray-400'}`}>
            {isMyTurn ? '你的回合' : '对手回合'}
          </div>
          <div className="text-xs text-gray-500">{phaseName}</div>
        </div>

        {/* 当前玩家信息 */}
        <div className={`flex items-center gap-2 ${isMyTurn ? 'opacity-100' : 'opacity-60'}`}>
          <div className="flex gap-1 mr-2">
            {Object.entries(currentPlayer.actionsUsed).map(([key, used]) => (
              <div
                key={key}
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] ${
                  used 
                    ? 'bg-gray-200 text-gray-400' 
                    : 'bg-green-100 text-green-600'
                }`}
                title={key}
              >
                {key.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
          <div className="text-right">
            <div className="font-medium text-sm">{currentPlayer.name}</div>
            <div className="text-xs text-gray-500">
              手牌 {currentPlayer.hand.length} 张
            </div>
          </div>
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
            style={{ backgroundColor: getGeishaColor(6) }}
          >
            {currentPlayer.name.charAt(0)}
          </div>
        </div>
      </div>

      {/* 得分提示 */}
      <div className="flex justify-center gap-8 mt-2 text-xs">
        <div className="text-gray-500">
          <span className="font-medium text-gray-700">{opponent.geishaCount}</span> 艺伎
          <span className="mx-1">|</span>
          <span className="font-medium text-gray-700">{opponent.totalCharm}</span> 魅力值
        </div>
        <div className="text-gray-500">
          <span className="font-medium text-gray-700">{currentPlayer.geishaCount}</span> 艺伎
          <span className="mx-1">|</span>
          <span className="font-medium text-gray-700">{currentPlayer.totalCharm}</span> 魅力值
        </div>
      </div>
    </div>
  );
};
