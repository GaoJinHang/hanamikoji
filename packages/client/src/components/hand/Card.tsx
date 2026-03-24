/**
 * 花见小路 - 物品卡组件
 * 显示单个物品卡
 */

import React from 'react';
import { ItemCard } from '@hanamikoji/shared';

interface CardProps {
  card: ItemCard;
  isSelected?: boolean;
  isInteractive?: boolean;
}

/**
 * 物品图标映射
 */
const itemIcons: Record<string, string> = {
  '扇子': '🪭',
  '发簪': '🏮',
  '和服': '👘',
  '茶具': '🍵',
  '乐器': '🎵',
  '花朵': '🌹',
  '香料': '🌸',
};

/**
 * 物品卡组件
 */
export const CardComponent: React.FC<CardProps> = ({ card, isSelected = false, isInteractive = false }) => {
  const icon = itemIcons[card.displayValue] || '📦';

  return (
    <div
      className={`
        relative rounded-lg overflow-hidden transition-all duration-200
        ${isInteractive ? 'cursor-pointer hover:scale-105 active:scale-95' : ''}
        ${isSelected ? 'ring-2 ring-game-primary ring-offset-1 transform -translate-y-2' : ''}
        shadow-md hover:shadow-lg
      `}
      style={{
        backgroundColor: card.color,
        width: '48px',
        height: '64px',
      }}
    >
      {/* 物品图标 */}
      <div className="absolute inset-0 flex items-center justify-center text-xl">
        {icon}
      </div>

      {/* 魅力值标记 */}
      <div 
        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
        style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
      >
        {card.geishaCharm}
      </div>

      {/* 艺伎名称缩写 */}
      <div 
        className="absolute bottom-0.5 left-0.5 text-[6px] font-medium text-white"
        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
      >
        {card.geishaName}
      </div>

      {/* 选中状态的边框 */}
      {isSelected && (
        <div className="absolute inset-0 border-2 border-game-primary rounded-lg" />
      )}
    </div>
  );
};

// 修复导出名称
export const Card = CardComponent;
