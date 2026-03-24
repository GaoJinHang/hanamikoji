/**
 * 花见小路 - 赠予选择模态框组件
 * 处理赠予行动的选择
 */

import React from 'react';
import { ItemCard } from '@hanamikoji/shared';

interface GiftModalProps {
  isOpen: boolean;
  cardDetails: ItemCard[];
  onSelect: (selectedIndex: number) => void;
  isInitiator: boolean;
  opponentName: string;
}

export const GiftModal: React.FC<GiftModalProps> = ({ 
  isOpen, 
  cardDetails, 
  onSelect, 
  isInitiator,
  opponentName,
}) => {
  if (!isOpen) return null;

  // 发起者视角
  if (isInitiator) {
    return (
      <div className="modal-overlay">
        <div className="modal-content p-4 max-w-sm mx-4">
          <h3 className="text-lg font-bold text-center mb-2">🎁 赠予行动</h3>
          <p className="text-sm text-gray-500 text-center mb-4">
            已发起赠予，请等待 {opponentName} 选择...
          </p>
          
          {/* 显示所有卡牌 */}
          <div className="flex justify-center gap-2 mb-4">
            {cardDetails.map((card, index) => (
              <div 
                key={card.id}
                className="w-12 h-16 rounded-lg flex items-center justify-center text-2xl"
                style={{ backgroundColor: card.color }}
              >
                {index + 1}
              </div>
            ))}
          </div>

          <div className="text-center text-xs text-gray-400">
            对方将从这些卡牌中选择1张
          </div>
        </div>
      </div>
    );
  }

  // 选择者视角
  return (
    <div className="modal-overlay">
      <div className="modal-content p-4 max-w-sm mx-4">
        <h3 className="text-lg font-bold text-center mb-2">⚠️ 请选择</h3>
        <p className="text-sm text-gray-500 text-center mb-4">
          {opponentName} 赠送了3张卡牌，请选择1张
        </p>

        {/* 卡牌选择列表 */}
        <div className="space-y-2 mb-4">
          {cardDetails.map((card, index) => (
            <button
              key={card.id}
              onClick={() => onSelect(index)}
              className="w-full flex items-center gap-3 p-2 rounded-lg border border-gray-200 hover:border-game-primary hover:bg-gray-50 transition-all"
            >
              <div 
                className="w-10 h-14 rounded flex items-center justify-center text-lg"
                style={{ backgroundColor: card.color }}
              >
                {index + 1}
              </div>
              <div className="flex-1 text-left">
                <div className="font-medium text-sm">{card.geishaName} · {card.geishaCharm}分</div>
                <div className="text-xs text-gray-400">{card.displayValue}</div>
              </div>
              <div className="text-game-primary text-sm">选择</div>
            </button>
          ))}
        </div>

        <p className="text-xs text-center text-gray-400">
          你将获得选中的卡牌，其余归对手所有
        </p>
      </div>
    </div>
  );
};
