/**
 * 花见小路 - 艺伎网格组件
 * 显示所有七位艺伎的状态
 */

import React from 'react';
import { GeishaCard as GeishaCardType, GeishaCharm } from '@hanamikoji/shared';
import { GeishaCard } from './GeishaCard';

interface GeishaGridProps {
  geishas: Record<GeishaCharm, GeishaCardType>;
  currentPlayerId: 'p1' | 'p2';
}

export const GeishaGrid: React.FC<GeishaGridProps> = ({ geishas, currentPlayerId }) => {
  // 按魅力值排序（2~8 共 7 位艺伎）
  const sortedCharmValues: GeishaCharm[] = [2, 3, 4, 5, 6, 7, 8];

  return (
    <div className="h-full flex items-stretch">
      {/* 统一大小，单行横向排布，几乎充满宽度 */}
      <div className="flex-1 flex flex-row gap-2">
        {sortedCharmValues.map((charm) => (
          <div key={charm} className="flex-1 max-w-[13%]">
            <GeishaCard
              geisha={geishas[charm]}
              currentPlayerId={currentPlayerId}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
