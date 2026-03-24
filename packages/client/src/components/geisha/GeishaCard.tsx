/**
 * 花见小路 - 艺伎卡片组件
 * 显示单个艺伎的状态
 */

import React from 'react';
import { GeishaCard as GeishaCardType, PlayerId } from '@hanamikoji/shared';

interface GeishaCardProps {
  geisha: GeishaCardType;
  currentPlayerId: PlayerId;
}

/**
 * 获取物品数量显示
 */
function getItemCounts(geisha: GeishaCardType): { p1: number; p2: number } {
  return {
    p1: geisha.items.p1.length,
    p2: geisha.items.p2.length,
  };
}

/**
 * 艺伎名称显示
 */
const geishaNames: Record<number, string> = {
  2: '樱',
  3: '梅',
  4: '兰',
  5: '竹',
  6: '菊',
  7: '玫瑰',
  8: '百合',
};

export const GeishaCardComponent: React.FC<GeishaCardProps> = ({ geisha, currentPlayerId }) => {
  const counts = getItemCounts(geisha);
  const isP1Owner = geisha.owner === 'p1';
  const isP2Owner = geisha.owner === 'p2';
  const isMyCard = geisha.owner === currentPlayerId;

  return (
    <div 
      className={`
        relative rounded-lg overflow-hidden transition-all duration-300
        ${isMyCard ? 'ring-2 ring-game-primary shadow-lg' : ''}
        ${geisha.owner ? 'scale-105' : 'scale-100'}
      `}
      style={{ 
        backgroundColor: geisha.color,
        aspectRatio: '3/4',
      }}
    >
      {/* 艺伎信息 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center p-1">
        {/* 名称和魅力值 */}
        <div className="text-center">
          <div className="text-lg font-bold text-white drop-shadow-md">
            {geisha.name}
          </div>
          <div className="text-2xl font-bold text-white drop-shadow-md">
            {geisha.value}
          </div>
        </div>

        {/* 物品数量对比 */}
        <div className="absolute inset-x-0 bottom-2 flex justify-between px-2">
          {/* 玩家1 */}
          <div className={`flex flex-col items-center ${isP1Owner ? 'text-white' : 'text-white/70'}`}>
            <div className="flex gap-0.5">
              {Array.from({ length: Math.max(counts.p1, counts.p2) }).map((_, i) => (
                <div
                  key={i}
                  className={`
                    w-3 h-3 rounded-full border border-white/50
                    ${i < counts.p1 ? 'bg-white' : 'bg-transparent'}
                  `}
                />
              ))}
            </div>
            <div className="text-[8px] font-medium mt-0.5">
              {counts.p1}
            </div>
          </div>

          {/* 玩家2 */}
          <div className={`flex flex-col items-center ${isP2Owner ? 'text-white' : 'text-white/70'}`}>
            <div className="flex gap-0.5">
              {Array.from({ length: Math.max(counts.p1, counts.p2) }).map((_, i) => (
                <div
                  key={i}
                  className={`
                    w-3 h-3 rounded-full border border-white/50
                    ${i < counts.p2 ? 'bg-white' : 'bg-transparent'}
                  `}
                />
              ))}
            </div>
            <div className="text-[8px] font-medium mt-0.5">
              {counts.p2}
            </div>
          </div>
        </div>

        {/* 归属标记 */}
        {geisha.owner && (
          <div 
            className={`
              absolute -top-1 -right-1 w-6 h-6 rounded-full
              flex items-center justify-center text-xs font-bold
              ${isP1Owner ? 'bg-blue-500' : 'bg-red-500'}
            `}
          >
            {isP1Owner ? 'P1' : 'P2'}
          </div>
        )}
      </div>

      {/* 背景装饰 */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-2 right-2 text-4xl opacity-30">
          {geisha.name === '樱' && '🌸'}
          {geisha.name === '梅' && '🌺'}
          {geisha.name === '兰' && '🌼'}
          {geisha.name === '竹' && '🎍'}
          {geisha.name === '菊' && '🌻'}
          {geisha.name === '玫瑰' && '🌹'}
          {geisha.name === '百合' && '🌷'}
        </div>
      </div>
    </div>
  );
};

// 修复导出名称
export const GeishaCard = GeishaCardComponent;
