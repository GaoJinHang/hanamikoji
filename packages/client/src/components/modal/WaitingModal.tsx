/**
 * 花见小路 - 等待模态框组件
 * 显示等待对手的提示
 */

import React from 'react';

interface WaitingModalProps {
  isOpen: boolean;
  message?: string;
}

export const WaitingModal: React.FC<WaitingModalProps> = ({ 
  isOpen, 
  message = '等待对手行动中...' 
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content p-6 text-center">
        {/* 加载动画 */}
        <div className="relative w-16 h-16 mx-auto mb-4">
          <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-game-primary rounded-full animate-spin border-t-transparent"></div>
        </div>
        
        {/* 消息 */}
        <p className="text-gray-600 mb-4">{message}</p>
        
        {/* 提示 */}
        <p className="text-xs text-gray-400">
          请稍候，对手正在思考...
        </p>
      </div>
    </div>
  );
};
