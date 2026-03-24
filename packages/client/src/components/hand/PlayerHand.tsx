/**
 * 花见小路 - 玩家手牌组件
 * 显示玩家当前的手牌
 */

import React from 'react';
import { ItemCard } from '@hanamikoji/shared';
import { Card } from './Card';

interface PlayerHandProps {
  cards: ItemCard[];
  selectedCards: string[];
  onCardSelect: (cardId: string) => void;
  isInteractive: boolean;
}

/**
 * 获取排序后的手牌
 */
function getSortedCards(cards: ItemCard[]): ItemCard[] {
  // 按魅力值分组排序
  const sorted = [...cards].sort((a, b) => a.geishaCharm - b.geishaCharm);
  return sorted;
}

export const PlayerHand: React.FC<PlayerHandProps> = ({
  cards,
  selectedCards,
  onCardSelect,
  isInteractive,
}) => {
  const sortedCards = getSortedCards(cards);

  return (
    <div className="mt-2">
      {/* 手牌标题 */}
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-sm font-medium text-gray-600">我的手牌</span>
        <span className="text-xs text-gray-400">{cards.length} 张</span>
      </div>

      {/* 手牌列表 */}
      <div className="flex gap-1 overflow-x-auto pb-1 no-select">
        {sortedCards.map((card, index) => (
          <div
            key={card.id}
            className={`
              flex-shrink-0 transition-all duration-200
              ${isInteractive ? 'cursor-pointer' : ''}
              ${selectedCards.includes(card.id) ? '-translate-y-3' : ''}
            `}
            onClick={() => isInteractive && onCardSelect(card.id)}
            style={{ marginLeft: index === 0 ? '0' : '-8px' }}
          >
            <Card 
              card={card} 
              isSelected={selectedCards.includes(card.id)}
              isInteractive={isInteractive}
            />
          </div>
        ))}
        
        {/* 占位卡片（使布局对称） */}
        {sortedCards.length > 0 && sortedCards.length < 8 && (
          <div className="flex-shrink-0" style={{ marginLeft: '-8px' }}>
            <div className="w-12 h-16 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
              <span className="text-xs text-gray-400">{8 - sortedCards.length}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
