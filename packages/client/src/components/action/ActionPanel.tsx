/**
 * 花见小路 - 行动按钮面板组件
 * 显示四种行动按钮和抽牌按钮
 */

import React from 'react';
import { PlayerActions, ActionType } from '@hanamikoji/shared';
import { ACTION_CONFIG } from '@hanamikoji/engine';

interface ActionPanelProps {
  actions: PlayerActions;
  selectedAction: ActionType | null;
  selectedCount: number;
  isMyTurn: boolean;
  onActionSelect: (action: ActionType) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onDraw: () => void;
  canDraw: boolean;
}

/**
 * 行动按钮组件
 */
const ActionButton: React.FC<{
  action: ActionType;
  available: boolean;
  isSelected: boolean;
  isMyTurn: boolean;
  onClick: () => void;
}> = ({ action, available, isSelected, isMyTurn, onClick }) => {
  const config = ACTION_CONFIG[action];
  const isDisabled = !available || !isMyTurn;

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={`
        flex flex-col items-center justify-center p-2 rounded-xl transition-all
        ${isDisabled 
          ? 'bg-gray-100 opacity-50 cursor-not-allowed' 
          : isSelected
            ? 'ring-2 ring-offset-1'
            : 'hover:bg-opacity-80 active:scale-95'
        }
        ${isSelected ? `bg-[${config.color}] text-white` : ''}
      `}
      style={{ 
        backgroundColor: isSelected ? config.color : undefined,
      }}
    >
      <span className={`text-lg ${isSelected ? 'text-white' : ''}`}>
        {action === 'secret' && '🔒'}
        {action === 'discard' && '🗑️'}
        {action === 'gift' && '🎁'}
        {action === 'competition' && '⚔️'}
      </span>
      <span className={`text-[10px] font-medium ${isSelected ? 'text-white' : ''}`}>
        {config.name}
      </span>
    </button>
  );
};

export const ActionPanel: React.FC<ActionPanelProps> = ({
  actions,
  selectedAction,
  selectedCount,
  isMyTurn,
  onActionSelect,
  onConfirm,
  onCancel,
  onDraw,
  canDraw,
}) => {
  const actionTypes: ActionType[] = ['secret', 'discard', 'gift', 'competition'];

  // 计算当前行动需要的卡牌数量
  const currentCardCount = selectedAction ? ACTION_CONFIG[selectedAction].cardCount : 0;
  const canConfirm = selectedCount === currentCardCount && currentCardCount > 0;

  return (
    <div>
      {/* 行动按钮行 */}
      <div className="grid grid-cols-4 gap-1 mb-2">
        {actionTypes.map((action) => (
          <ActionButton
            key={action}
            action={action}
            available={!actions[action]}
            isSelected={selectedAction === action}
            isMyTurn={isMyTurn}
            onClick={() => onActionSelect(action)}
          />
        ))}
      </div>

      {/* 操作按钮行 */}
      <div className="flex gap-2">
        {/* 抽牌按钮 */}
        <button
          onClick={onDraw}
          disabled={!canDraw}
          className={`
            flex-1 py-2 rounded-xl font-medium text-sm transition-all
            ${canDraw 
              ? 'bg-game-primary text-white hover:bg-opacity-90 active:scale-95' 
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }
          `}
        >
          🎴 抽牌
        </button>

        {/* 确认/取消按钮 */}
        {selectedAction ? (
          <>
            <button
              onClick={onConfirm}
              disabled={!canConfirm}
              className={`
                flex-1 py-2 rounded-xl font-medium text-sm transition-all
                ${canConfirm
                  ? 'bg-green-500 text-white hover:bg-opacity-90 active:scale-95'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }
              `}
            >
              ✓ 确认 ({selectedCount}/{currentCardCount})
            </button>
            <button
              onClick={onCancel}
              className="flex-1 py-2 rounded-xl font-medium text-sm transition-all bg-gray-200 text-gray-600 hover:bg-gray-300 active:scale-95"
            >
              ✕ 取消
            </button>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-gray-400">
            {isMyTurn ? '请选择行动' : '等待对手...'}
          </div>
        )}
      </div>

      {/* 当前行动说明 */}
      {selectedAction && (
        <div 
          className="mt-2 p-2 rounded-lg text-xs text-white text-center"
          style={{ backgroundColor: ACTION_CONFIG[selectedAction].color }}
        >
          {ACTION_CONFIG[selectedAction].description}
        </div>
      )}
    </div>
  );
};
