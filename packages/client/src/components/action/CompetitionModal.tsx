/**
 * 花见小路 - 竞争分组/选择模态框组件
 * 处理竞争行动的分组和选择
 */

import React, { useEffect, useState } from 'react';
import { ItemCard } from '@hanamikoji/shared';

interface CompetitionModalProps {
  isOpen: boolean;
  cardDetails: ItemCard[];
  grouping: string[][];
  selectedCards: string[];
  onGroupChange: (cards: string[]) => void;
  onComplete: (grouping: string[][]) => void;
  onSelect: (selectedIndex: number) => void;
  isInitiator: boolean;
  opponentName: string;
}

export const CompetitionModal: React.FC<CompetitionModalProps> = ({ 
  isOpen, 
  cardDetails,
  grouping,
  selectedCards,
  onGroupChange,
  onComplete,
  onSelect,
  isInitiator,
  opponentName,
}) => {
  if (!isOpen) return null;

  // 发起者视角 - 分组
  if (isInitiator) {
    // 本地维护分组状态：group1 / group2
    const initGroup1 = grouping?.[0] && grouping[0].length === 2
      ? grouping[0]
      : selectedCards.slice(0, 2);
    const initGroup2 = grouping?.[1] && grouping[1].length === 2
      ? grouping[1]
      : selectedCards.slice(2, 4);

    const [group1, setGroup1] = useState<string[]>(initGroup1);
    const [group2, setGroup2] = useState<string[]>(initGroup2);

    // 当选中的4张牌变化时，重置本地分组
    useEffect(() => {
      if (selectedCards.length === 4) {
        setGroup1(selectedCards.slice(0, 2));
        setGroup2(selectedCards.slice(2, 4));
      }
    }, [selectedCards.join(',')]);

    // 点击卡牌时在两组之间移动（保证每组最多2张）
    const handleToggleCard = (cardId: string) => {
      if (!selectedCards.includes(cardId)) return;

      if (group1.includes(cardId)) {
        // 从组1移到组2（若组2未满）
        if (group2.length >= 2) return;
        const nextG1 = group1.filter(id => id !== cardId);
        const nextG2 = [...group2, cardId];
        setGroup1(nextG1);
        setGroup2(nextG2);
        onGroupChange([...nextG1, ...nextG2]);
        return;
      }

      if (group2.includes(cardId)) {
        // 从组2移到组1（若组1未满）
        if (group1.length >= 2) return;
        const nextG2 = group2.filter(id => id !== cardId);
        const nextG1 = [...group1, cardId];
        setGroup1(nextG1);
        setGroup2(nextG2);
        onGroupChange([...nextG1, ...nextG2]);
        return;
      }

      // 理论上不会到这里（4张牌都在两组中），兜底逻辑：放入未满的一组
      if (group1.length < 2) {
        const nextG1 = [...group1, cardId];
        setGroup1(nextG1);
        setGroup2(group2);
        onGroupChange([...nextG1, ...group2]);
      } else if (group2.length < 2) {
        const nextG2 = [...group2, cardId];
        setGroup1(group1);
        setGroup2(nextG2);
        onGroupChange([...group1, ...nextG2]);
      }
    };

    const currentGrouping = [group1, group2];

    // 为了和选择者视角 UI 保持一致，这里也按「两组卡片块」的形式展示，
    // 只是点击单张卡片可以在两组之间切换。
    const buildGroupCards = (group: string[]) => {
      const groupCardDetails = group
        .map(id => cardDetails.find(c => c.id === id))
        .filter((c): c is ItemCard => c !== undefined);

      return (
        <div className="flex gap-1">
          {groupCardDetails.map(card => (
            <button
              key={card.id}
              type="button"
              onClick={() => handleToggleCard(card.id)}
              className="w-8 h-10 rounded flex items-center justify-center text-xs shadow-sm"
              style={{ backgroundColor: card.color }}
            >
              {card.geishaCharm}
            </button>
          ))}
        </div>
      );
    };

    return (
      <div className="modal-overlay">
        <div className="modal-content p-4 max-w-sm mx-4">
          <h3 className="text-lg font-bold text-center mb-2">⚔️ 竞争行动</h3>
          <p className="text-sm text-gray-500 text-center mb-4">
            将4张卡牌分成2组（每组2张）
          </p>

          {/* 分组区块：与选择者视图风格一致 */}
          <div className="space-y-3 mb-4">
            {[group1, group2].map((group, index) => {
              const groupNumber = index + 1;
              const totalCharm = group
                .map(id => cardDetails.find(c => c.id === id))
                .filter((c): c is ItemCard => c !== undefined)
                .reduce((sum, c) => sum + c.geishaCharm, 0);

              return (
                <div
                  key={groupNumber}
                  className="w-full p-3 rounded-lg border-2 border-gray-200 bg-white text-left"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        groupNumber === 1 ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'
                      }`}
                    >
                      {groupNumber}
                    </div>
                    <span className="font-medium text-sm">
                      {groupNumber === 1 ? '第1组' : '第2组'}（点击牌可在两组间移动）
                    </span>
                  </div>

                  {buildGroupCards(group)}

                  <div className="text-xs text-gray-400 mt-1">
                    合计: {totalCharm} 分
                  </div>
                </div>
              );
            })}
          </div>

          {/* 确认按钮 */}
          <button
            onClick={() => onComplete(currentGrouping)}
            disabled={group1.length !== 2 || group2.length !== 2}
            className={`
              w-full py-2 rounded-xl font-medium text-sm transition-all
              ${group1.length === 2 && group2.length === 2
                ? 'bg-game-primary text-white hover:bg-opacity-90'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }
            `}
          >
            确认分组
          </button>

          <p className="text-xs text-center text-gray-400 mt-2">
            对手将从两组中选择1组
          </p>
        </div>
      </div>
    );
  }

  // 选择者视角
  return (
    <div className="modal-overlay">
      <div className="modal-content p-4 max-w-sm mx-4">
        <h3 className="text-lg font-bold text-center mb-2">⚔️ 竞争选择</h3>
        <p className="text-sm text-gray-500 text-center mb-4">
          {opponentName} 发起竞争，请选择1组
        </p>

        {/* 分组选择 */}
        <div className="space-y-3 mb-4">
          {grouping.map((group, index) => {
            const groupCardDetails = group
              .map(id => cardDetails.find(c => c.id === id))
              .filter((c): c is ItemCard => c !== undefined);
            const groupNumber = index + 1;

            return (
              <button
                key={index}
                onClick={() => onSelect(index)}
                className="w-full p-3 rounded-lg border-2 border-gray-200 hover:border-game-primary hover:bg-gray-50 transition-all text-left"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    groupNumber === 1 ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'
                  }`}>
                    {groupNumber}
                  </div>
                  <span className="font-medium text-sm">选择此组</span>
                </div>
                <div className="flex gap-1">
                  {groupCardDetails.map(card => (
                    <div 
                      key={card.id}
                      className="w-8 h-10 rounded flex items-center justify-center text-xs"
                      style={{ backgroundColor: card.color }}
                    >
                      {card.geishaCharm}
                    </div>
                  ))}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  合计: {groupCardDetails.reduce((sum, c) => sum + c.geishaCharm, 0)} 分
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-center text-gray-400">
          你将获得选中组的所有卡牌
        </p>
      </div>
    </div>
  );
};
