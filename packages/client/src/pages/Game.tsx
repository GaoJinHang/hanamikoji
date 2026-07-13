/**
 * 花见小路 - 游戏页面
 * 显示完整的游戏界面，包括艺伎区、手牌区和操作面板
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useSocket } from '../hooks';
import { ACTION_CONFIG, MAX_ROUNDS, getCardDetails } from '@hanamikoji/shared';
import type { ActionType, GameOverPayload, GameState as GameStateType, ItemCard, PendingAction, PlayerId } from '@hanamikoji/shared';
import { Header } from '../components/layout/Header';
import { GeishaGrid } from '../components/geisha/GeishaGrid';
import { ActionPanel } from '../components/action/ActionPanel';
import { PlayerHand } from '../components/hand/PlayerHand';
import { GameOverModal } from '../components/modal/GameOverModal';
import { WaitingModal } from '../components/modal/WaitingModal';
import { GiftModal } from '../components/action/GiftModal';
import { CompetitionModal } from '../components/action/CompetitionModal';

interface GameProps {
  gameState: GameStateType;
  playerId: PlayerId;
  onLeave: () => void;
}

export const Game: React.FC<GameProps> = ({ gameState, playerId, onLeave }) => {
  const socket = useSocket();
  
  // 当前玩家状态
  const currentPlayer = gameState.players[playerId];
  const opponentPlayer = gameState.players[playerId === 'p1' ? 'p2' : 'p1'];
  
  // 是否为自己的回合
  const isMyTurn = gameState.activePlayer === playerId;
  const isMyActionPhase = playerId === 'p1' ? gameState.phase === 'p1_action' : gameState.phase === 'p2_action';
  const isMySelectPhase = playerId === 'p1' ? gameState.phase === 'p1_select' : gameState.phase === 'p2_select';
  const isMyDrawPhase = playerId === 'p1' ? gameState.phase === 'p1_draw' : gameState.phase === 'p2_draw';
  
  // 选中的卡牌
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [currentAction, setCurrentAction] = useState<ActionType | null>(null);
  
  // 模态框状态
  const [showGameOver, setShowGameOver] = useState(false);
  const [showGift, setShowGift] = useState(false);
  const [showCompetition, setShowCompetition] = useState(false);
  
  // 游戏结束数据
  const [gameOverData, setGameOverData] = useState<GameOverPayload | null>(null);

  // 监听行动要求
  useEffect(() => {
    if (!socket || !socket.emit) return;

    const handleActionRequired = (_type: ActionType, _minCards: number, _maxCards: number) => {
      setSelectedCards([]);
      setCurrentAction(null);
    };

    const handleChoiceRequired = (pendingAction: PendingAction) => {
      // 只有「选择者」需要弹出对应的选择模态框
      if (pendingAction.chooser !== playerId) {
        return;
      }

      if (pendingAction.type === 'gift') {
        setShowGift(true);
      } else if (pendingAction.type === 'competition') {
        setShowCompetition(true);
      }
    };

    const handleGameOver = (data: GameOverPayload) => {
      setGameOverData(data);
      setShowGameOver(true);
    };

    const handlePhaseChanged = () => {
      setSelectedCards([]);
      setCurrentAction(null);
    };

    socket.on('actionRequired', handleActionRequired);
    socket.on('choiceRequired', handleChoiceRequired);
    socket.on('gameOver', handleGameOver);
    socket.on('phaseChanged', handlePhaseChanged);

    return () => {
      socket.off('actionRequired', handleActionRequired);
      socket.off('choiceRequired', handleChoiceRequired);
      socket.off('gameOver', handleGameOver);
      socket.off('phaseChanged', handlePhaseChanged);
    };
  }, [socket, playerId]);

  // 以服务端状态为准打开/关闭选择弹窗，避免遗漏一次性 socket 事件。
  useEffect(() => {
    const pending = gameState.pendingAction;
    setShowGift(pending?.type === 'gift' && pending.chooser === playerId);

    if (pending?.type === 'competition') {
      setShowCompetition(pending.chooser === playerId);
      return;
    }

    if (currentAction !== 'competition') {
      setShowCompetition(false);
    }
  }, [gameState.pendingAction, playerId, currentAction]);

  // 处理卡牌选择
  const handleCardSelect = useCallback((cardId: string) => {
    if (!isMyActionPhase || !currentAction) return;

    if (selectedCards.includes(cardId)) {
      setSelectedCards(prev => prev.filter(id => id !== cardId));
    } else {
      const cardCount = ACTION_CONFIG[currentAction].cardCount;
      if (selectedCards.length < cardCount) {
        setSelectedCards(prev => [...prev, cardId]);
      }
    }
  }, [isMyActionPhase, currentAction, selectedCards]);

  // 处理行动按钮点击
  const handleActionSelect = useCallback((action: ActionType) => {
    if (!isMyActionPhase) return;
    if (currentPlayer.actionsUsed[action]) return;

    setCurrentAction(action);
    setSelectedCards([]);
  }, [isMyActionPhase, currentPlayer.actionsUsed]);

  // 确认执行行动
  const handleConfirmAction = useCallback(() => {
    if (!socket || !socket.emit) return;
    if (!currentAction || selectedCards.length === 0) return;

    const cardCount = ACTION_CONFIG[currentAction].cardCount;
    if (selectedCards.length !== cardCount) {
      return;
    }

    if (currentAction === 'competition') {
      setShowCompetition(true);
      return;
    }

    socket.emit('playAction', {
      type: currentAction,
      cardIds: selectedCards,
    });

    setCurrentAction(null);
    setSelectedCards([]);
  }, [socket, currentAction, selectedCards]);

  // 取消行动
  const handleCancelAction = useCallback(() => {
    setCurrentAction(null);
    setSelectedCards([]);
  }, []);

  // 抽牌
  const handleDrawCard = useCallback(() => {
    if (!socket || !socket.emit) return;
    if (!isMyTurn) return;
    socket.emit('drawCard');
  }, [socket, isMyTurn]);

  // 处理赠予选择完成
  const handleGiftComplete = useCallback((selectedIndex: number) => {
    if (!socket || !socket.emit) return;
    socket.emit('resolveAction', selectedIndex);
    setShowGift(false);
  }, [socket]);

  // 处理竞争分组完成
  const handleCompetitionComplete = useCallback((grouping: string[][]) => {
    if (!socket || !socket.emit) return;
    if (selectedCards.length !== 4) return;
    socket.emit('playAction', {
      type: 'competition',
      cardIds: selectedCards,
      grouping,
    });
    setShowCompetition(false);
    setCurrentAction(null);
    setSelectedCards([]);
  }, [socket, selectedCards]);

  // 处理竞争选择完成（作为选择者）
  const handleCompetitionSelect = useCallback((selectedIndex: number) => {
    if (!socket || !socket.emit) return;
    socket.emit('resolveAction', selectedIndex);
    setShowCompetition(false);
  }, [socket]);

  // 关闭游戏结束弹窗
  const handleCloseGameOver = useCallback(() => {
    setShowGameOver(false);
    socket?.emit('leaveRoom');
    onLeave();
  }, [socket, onLeave]);

  // 获取当前阶段显示名称
  const getPhaseDisplayName = () => {
    const phaseNames: Record<string, string> = {
      'lobby': '等待开始',
      'p1_draw': `${gameState.players.p1.name}抽牌中`,
      'p1_action': `${gameState.players.p1.name}行动中`,
      'p2_draw': `${gameState.players.p2.name}抽牌中`,
      'p2_action': `${gameState.players.p2.name}行动中`,
      'p1_select': `${gameState.players.p1.name}选择中`,
      'p2_select': `${gameState.players.p2.name}选择中`,
      'scoring': '计分中',
      'game_over': '游戏结束',
    };
    return phaseNames[gameState.phase] || gameState.phase;
  };

  // 获取卡牌详情
  const handCards = getCardDetails(currentPlayer.hand);

  // 竞争模态框所需的数据：
  // - 发起者本地分组阶段：使用当前选中的4张手牌
  // - 选择者服务器广播阶段：使用 pendingAction 中的数据
  const competitionCardDetails: ItemCard[] = gameState.pendingAction?.type === 'competition'
    ? (gameState.pendingAction.cardDetails || [])
    : getCardDetails(selectedCards);
  const competitionGrouping: string[][] = gameState.pendingAction?.type === 'competition'
    ? gameState.pendingAction.cards
    : [];
  // 发起者在本地只会自己打开竞争分组弹窗，因此在没有 pendingAction 时可以认为当前玩家是发起者
  const competitionIsInitiator = gameState.pendingAction?.type === 'competition'
    ? gameState.pendingAction.initiator === playerId
    : true;

  const waitingPhases = ['p1_draw', 'p2_draw', 'p1_select', 'p2_select'];
  const showWaiting = waitingPhases.includes(gameState.phase) && !isMyTurn;

  return (
    <div className="h-screen flex flex-col bg-game-bg overflow-hidden">
      {/* 顶部：对手信息和阶段显示 */}
      <Header 
        opponent={opponentPlayer}
        currentPlayer={currentPlayer}
        isMyTurn={isMyTurn}
        phaseName={getPhaseDisplayName()}
        round={gameState.round}
        maxRounds={MAX_ROUNDS}
        roomId={gameState.roomId}
      />

      {/* 中间：艺伎展示区 */}
      <div className="flex-1 px-2 py-2 overflow-y-auto">
        <GeishaGrid 
          geishas={gameState.geishas}
          currentPlayerId={playerId}
        />
      </div>

      {/* 底部：玩家区域 */}
      <div className="bg-gray-100 rounded-t-2xl p-2 pb-safe">
        {/* 行动按钮 */}
        <ActionPanel 
          actions={currentPlayer.actionsUsed}
          selectedAction={currentAction}
          selectedCount={selectedCards.length}
          isMyTurn={isMyActionPhase}
          onActionSelect={handleActionSelect}
          onConfirm={handleConfirmAction}
          onCancel={handleCancelAction}
          onDraw={handleDrawCard}
          canDraw={isMyTurn && isMyDrawPhase}
        />

        {/* 手牌区 */}
        <div className="mt-2">
          <PlayerHand 
            cards={handCards}
            selectedCards={selectedCards}
            onCardSelect={handleCardSelect}
            isInteractive={isMyActionPhase && currentAction !== null}
          />
        </div>
      </div>

      {/* 等待对手模态框 */}
      <WaitingModal 
        isOpen={showWaiting}
        message={isMySelectPhase ? '请等待对手做出选择...' : '等待对手行动中...'}
      />

      {/* 赠予选择模态框 */}
      <GiftModal 
        isOpen={showGift}
        cardDetails={gameState.pendingAction?.type === 'gift' ? gameState.pendingAction.cardDetails || [] : []}
        onSelect={handleGiftComplete}
        isInitiator={gameState.pendingAction?.type === 'gift' ? gameState.pendingAction.initiator === playerId : false}
        opponentName={opponentPlayer.name}
      />

      {/* 竞争分组/选择模态框 */}
      <CompetitionModal 
        isOpen={showCompetition}
        cardDetails={competitionCardDetails}
        grouping={competitionGrouping}
        selectedCards={selectedCards}
        onComplete={handleCompetitionComplete}
        onSelect={handleCompetitionSelect}
        isInitiator={competitionIsInitiator}
        opponentName={opponentPlayer.name}
      />

      {/* 游戏结束模态框 */}
      <GameOverModal 
        isOpen={showGameOver}
        gameOverData={gameOverData}
        playerId={playerId}
        onClose={handleCloseGameOver}
      />
    </div>
  );
};
