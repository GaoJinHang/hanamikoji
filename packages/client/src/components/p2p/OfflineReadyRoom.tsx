import React from 'react';
import type { PlayerId } from '@hanamikoji/shared';
import type { OfflineLobbyView } from '../../p2p/offlineSession';

export interface OfflineReadyRoomProps {
  view: OfflineLobbyView;
  onSetReady: (ready: boolean) => void;
  onStartGame: () => void;
}

export const OfflineReadyRoom: React.FC<OfflineReadyRoomProps> = ({ view, onSetReady, onStartGame }) => {
  const p1 = findPlayerName(view, 'p1');
  const p2 = findPlayerName(view, 'p2');
  const hostLabel = view.hostPlayerId === 'p1' ? p1 : p2;
  const canToggleReady = Boolean(view.playerId) && !view.gameStarted;
  const showStart = view.isHostPlayer && !view.gameStarted;

  return (
    <div className="rounded-2xl border border-game-primary/30 bg-game-primary/5 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">离线 P2P Ready 房间</div>
          <div className="text-xl font-semibold text-gray-900">房间号 <span className="font-mono">{view.roomId}</span></div>
          <div className="mt-1 text-sm text-gray-600">Host：{hostLabel} · 我是 {view.playerId ?? '未加入'}</div>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-game-primary shadow-sm">P2P Ready</span>
      </div>

      <div className="rounded-xl bg-white p-3 text-sm text-gray-700">
        <div className="font-medium text-gray-800 mb-1">连接状态</div>
        <div>{view.connectionStatus}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ReadyCard label="p1" name={p1} ready={view.ready.p1} isMe={view.playerId === 'p1'} isHost={view.hostPlayerId === 'p1'} />
        <ReadyCard label="p2" name={p2} ready={view.ready.p2} isMe={view.playerId === 'p2'} isHost={view.hostPlayerId === 'p2'} />
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => onSetReady(!view.localReady)}
          disabled={!canToggleReady}
          className={`w-full py-3 rounded-xl font-medium ${!canToggleReady ? 'bg-gray-300 text-gray-500' : view.localReady ? 'bg-amber-500 text-white' : 'bg-game-primary text-white'}`}
        >
          {view.localReady ? '取消准备' : '我已准备'}
        </button>
        {showStart && (
          <button
            type="button"
            onClick={onStartGame}
            disabled={!view.canStart}
            className={`w-full py-3 rounded-xl font-medium ${view.canStart ? 'bg-game-secondary text-white' : 'bg-gray-300 text-gray-500'}`}
          >
            {view.canStart ? '开始游戏' : '等待双方 Ready'}
          </button>
        )}
        {!view.isHostPlayer && <div className="text-xs text-gray-500 text-center">只有 Host 玩家可以在双方 Ready 后开始游戏。</div>}
      </div>
    </div>
  );
};

const ReadyCard: React.FC<{ label: PlayerId; name: string; ready: boolean; isMe: boolean; isHost: boolean }> = ({ label, name, ready, isMe, isHost }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-3">
    <div className="flex items-center justify-between text-xs text-gray-500">
      <span>{label}{isHost ? ' · Host' : ''}</span>
      {isMe && <span className="text-game-primary">我</span>}
    </div>
    <div className="mt-1 font-medium text-gray-900 truncate">{name}</div>
    <div className={`mt-2 text-sm font-medium ${ready ? 'text-green-600' : 'text-gray-400'}`}>{ready ? '已准备' : '未准备'}</div>
  </div>
);

function findPlayerName(view: OfflineLobbyView, playerId: PlayerId): string {
  return view.players.find(player => player.playerId === playerId)?.name ?? (playerId === 'p1' ? '等待 Host' : '等待 Player');
}
