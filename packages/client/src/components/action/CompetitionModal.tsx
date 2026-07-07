/**
 * 花见小路 - 竞争分组/选择模态框组件
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { ItemCard } from '@hanamikoji/shared';

interface CompetitionModalProps {
  isOpen: boolean;
  cardDetails: ItemCard[];
  grouping: string[][];
  selectedCards: string[];
  onComplete: (grouping: string[][]) => void;
  onSelect: (selectedIndex: number) => void;
  isInitiator: boolean;
  opponentName: string;
}

function generateGroupingOptions(cards: string[]): string[][][] {
  if (cards.length !== 4) return [];
  const [a, b, c, d] = cards;
  return [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ];
}

function createCardMap(cardDetails: ItemCard[]): Map<string, ItemCard> {
  return new Map(cardDetails.map(card => [card.id, card]));
}

function GroupCards({ group, cardMap }: { group: string[]; cardMap: Map<string, ItemCard> }) {
  const cards = group.map(id => cardMap.get(id)).filter((card): card is ItemCard => card !== undefined);

  return (
    <div className="flex gap-1">
      {cards.map(card => (
        <div
          key={card.id}
          className="w-8 h-10 rounded flex items-center justify-center text-xs shadow-sm"
          style={{ backgroundColor: card.color }}
        >
          {card.geishaCharm}
        </div>
      ))}
    </div>
  );
}

function GroupSummary({ group, cardMap, groupNumber }: { group: string[]; cardMap: Map<string, ItemCard>; groupNumber: number }) {
  const totalCharm = group
    .map(id => cardMap.get(id))
    .filter((card): card is ItemCard => card !== undefined)
    .reduce((sum, card) => sum + card.geishaCharm, 0);

  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
            groupNumber === 1 ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'
          }`}
        >
          {groupNumber}
        </div>
        <span className="font-medium text-sm">第{groupNumber}组</span>
      </div>
      <GroupCards group={group} cardMap={cardMap} />
      <div className="text-xs text-gray-400 mt-1">合计: {totalCharm} 分</div>
    </>
  );
}

export const CompetitionModal: React.FC<CompetitionModalProps> = ({
  isOpen,
  cardDetails,
  grouping,
  selectedCards,
  onComplete,
  onSelect,
  isInitiator,
  opponentName,
}) => {
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const cardMap = useMemo(() => createCardMap(cardDetails), [cardDetails]);
  const groupingOptions = useMemo(() => generateGroupingOptions(selectedCards), [selectedCards]);

  useEffect(() => {
    if (isOpen) setSelectedOptionIndex(0);
  }, [isOpen, selectedCards.join('|')]);

  if (!isOpen) return null;

  if (isInitiator) {
    const canConfirm = groupingOptions.length > 0;
    const selectedGrouping = groupingOptions[selectedOptionIndex] ?? [];

    return (
      <div className="modal-overlay">
        <div className="modal-content p-4 max-w-sm mx-4">
          <h3 className="text-lg font-bold text-center mb-2">⚔️ 竞争行动</h3>
          <p className="text-sm text-gray-500 text-center mb-4">选择一种分组方式，对手将从两组中选择1组</p>

          <div className="space-y-3 mb-4">
            {groupingOptions.map((option, optionIndex) => (
              <button
                key={optionIndex}
                type="button"
                onClick={() => setSelectedOptionIndex(optionIndex)}
                className={`w-full p-3 rounded-lg border-2 bg-white text-left transition-all ${
                  selectedOptionIndex === optionIndex ? 'border-game-primary' : 'border-gray-200 hover:border-game-primary'
                }`}
              >
                <div className="text-xs font-medium text-gray-500 mb-2">方案 {optionIndex + 1}</div>
                <div className="grid grid-cols-2 gap-2">
                  {option.map((group, index) => (
                    <div key={index} className="rounded-lg bg-gray-50 p-2">
                      <GroupSummary group={group} cardMap={cardMap} groupNumber={index + 1} />
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>

          <button
            onClick={() => canConfirm && onComplete(selectedGrouping)}
            disabled={!canConfirm}
            className={`w-full py-2 rounded-xl font-medium text-sm transition-all ${
              canConfirm ? 'bg-game-primary text-white hover:bg-opacity-90' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            确认分组
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content p-4 max-w-sm mx-4">
        <h3 className="text-lg font-bold text-center mb-2">⚔️ 竞争选择</h3>
        <p className="text-sm text-gray-500 text-center mb-4">{opponentName} 发起竞争，请选择1组</p>

        <div className="space-y-3 mb-4">
          {grouping.map((group, index) => (
            <button
              key={index}
              onClick={() => onSelect(index)}
              className="w-full p-3 rounded-lg border-2 border-gray-200 hover:border-game-primary hover:bg-gray-50 transition-all text-left"
            >
              <GroupSummary group={group} cardMap={cardMap} groupNumber={index + 1} />
              <div className="text-game-primary text-sm mt-2">选择此组</div>
            </button>
          ))}
        </div>

        <p className="text-xs text-center text-gray-400">你将获得选中组的所有卡牌</p>
      </div>
    </div>
  );
};
