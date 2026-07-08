import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useIsConnected, useSocket } from '../hooks';
import { hasExplicitSocketBackend } from '../context/socket';
import type { JoinRoomResponse, PlayerId, RoomPlayer } from '@hanamikoji/shared';
import type { OfflineP2PConnection } from '../connection';
import {
  createHostOfflineSession,
  createPlayerOfflineSession,
  type HostOfflineSession,
  type OfflineLobbyView,
  type PlayerOfflineSession,
} from '../p2p/offlineSession';
import { clearOfflineHash, parseOfflineHash } from '../p2p/inviteUrl';
import { loadClientSession, loadHostSnapshot } from '../p2p/storage';
import { OfflineReadyRoom } from '../components/p2p/OfflineReadyRoom';
import { OfflineRoomInvite } from '../components/p2p/OfflineRoomInvite';
import { getInitialLobbyMode, getOnlineBackendNotice, getRequestedLobbyModeFromSearch, type LobbyMode } from './lobbyMode';

interface LobbyProps {
  savedRoomId: string | null;
  savedPlayerId: PlayerId | null;
  onOfflineGameReady: (connection: OfflineP2PConnection) => void;
  onOfflineStateChanged: () => void;
}

type OfflineRole = 'host' | 'player';
type OfflineSession = HostOfflineSession | PlayerOfflineSession;

export const Lobby: React.FC<LobbyProps> = ({ savedRoomId, savedPlayerId, onOfflineGameReady, onOfflineStateChanged }) => {
  const socket = useSocket();
  const isConnected = useIsConnected();
  const hasExplicitOnlineBackend = hasExplicitSocketBackend();
  const [mode, setMode] = useState<LobbyMode>(() => getInitialLobbyMode({
    isProduction: import.meta.env.PROD,
    hasExplicitBackend: hasExplicitOnlineBackend,
    hasOfflineHash: typeof window !== 'undefined' && Boolean(parseOfflineHash(window.location.hash)),
    requestedMode: typeof window !== 'undefined' ? getRequestedLobbyModeFromSearch(window.location.search) : null,
  }));
  const [offlineRole, setOfflineRole] = useState<OfflineRole>('host');
  const [playerName, setPlayerName] = useState(savedPlayerId ? (savedPlayerId === 'p1' ? '玩家1' : '玩家2') : '');
  const [roomCode, setRoomCode] = useState(savedRoomId || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hostOffer, setHostOffer] = useState('');
  const [hostInviteText, setHostInviteText] = useState('');
  const [hostJoinUrl, setHostJoinUrl] = useState('');
  const [hostRelayInviteId, setHostRelayInviteId] = useState('');
  const [hostRelayError, setHostRelayError] = useState('');
  const [hostAnswerInput, setHostAnswerInput] = useState('');
  const [playerOfferInput, setPlayerOfferInput] = useState('');
  const [playerAnswer, setPlayerAnswer] = useState('');
  const [playerAnswerInviteText, setPlayerAnswerInviteText] = useState('');
  const [playerAnswerUrl, setPlayerAnswerUrl] = useState('');
  const [playerRelaySubmitted, setPlayerRelaySubmitted] = useState(false);
  const [offlineLobbyView, setOfflineLobbyView] = useState<OfflineLobbyView | null>(null);
  const sessionRef = useRef<OfflineSession | null>(null);
  const hashConsumedRef = useRef(false);

  const savedP2PSession = loadClientSession();
  const savedHostSnapshot = loadHostSnapshot();

  const resetMessages = () => {
    setError(null);
    setStatus(null);
  };

  const resetOfflineOutputs = () => {
    setHostOffer('');
    setHostInviteText('');
    setHostJoinUrl('');
    setHostRelayInviteId('');
    setHostRelayError('');
    setHostAnswerInput('');
    setPlayerAnswer('');
    setPlayerAnswerInviteText('');
    setPlayerAnswerUrl('');
    setPlayerRelaySubmitted(false);
    setOfflineLobbyView(null);
  };

  const switchMode = (nextMode: LobbyMode) => {
    setMode(nextMode);
    setIsWaiting(false);
    resetMessages();
  };

  const switchOfflineRole = (nextRole: OfflineRole) => {
    setOfflineRole(nextRole);
    resetMessages();
  };

  useEffect(() => {
    if (hashConsumedRef.current || typeof window === 'undefined') return;
    const parsed = parseOfflineHash(window.location.hash);
    if (!parsed) return;
    hashConsumedRef.current = true;
    setMode('offline-p2p');
    resetMessages();
    if (parsed.kind === 'join') {
      setOfflineRole('player');
      if (parsed.source === 'relay-invite') {
        setPlayerOfferInput(window.location.hash);
        setStatus('已读取扫码邀请。请填写昵称并点击“加入并生成 answer”。');
      } else {
        setPlayerOfferInput(parsed.signalText);
        setStatus('已读取离线邀请。请填写昵称并生成 answer。');
      }
    } else {
      setOfflineRole('host');
      setHostAnswerInput(parsed.signalText);
      setStatus('已读取 Player answer，请在 Host 页面导入。');
    }
    clearOfflineHash();
  }, []);

  const handleJoinRoom = useCallback((existingRoomId: string | null) => {
    if (!socket || !isConnected) {
      setError('正在连接服务器，请稍候...');
      return;
    }
    if (!playerName.trim()) {
      setError('请输入您的名称');
      return;
    }
    setIsLoading(true);
    setError(null);
    socket.emit('joinRoom', existingRoomId, playerName.trim(), (response: JoinRoomResponse) => {
      setIsLoading(false);
      if (response.success && response.roomId) {
        setRoomCode(response.roomId);
        setIsWaiting(true);
        setStatus(`已加入房间 ${response.roomId}，等待对手加入...`);
      } else {
        setError(response.message || '加入房间失败');
      }
    });
  }, [socket, isConnected, playerName]);

  useEffect(() => {
    if (!socket) return;
    const handlePlayerJoined = (player: RoomPlayer) => setStatus(`玩家 ${player.name} 已加入，游戏即将开始...`);
    const handleError = (message: string) => {
      setError(message);
      setIsLoading(false);
      setIsWaiting(false);
      setStatus(null);
    };
    socket.on('playerJoined', handlePlayerJoined);
    socket.on('error', handleError);
    return () => {
      socket.off('playerJoined', handlePlayerJoined);
      socket.off('error', handleError);
    };
  }, [socket]);

  const handleCreateRoom = () => handleJoinRoom(null);
  const handleJoinExistingRoom = () => {
    if (!roomCode.trim()) {
      setError('请输入房间号');
      return;
    }
    handleJoinRoom(roomCode.trim().toUpperCase());
  };

  const createOfflineHost = async (restoreLastHost: boolean) => {
    if (!playerName.trim()) {
      setError('请输入您的名称');
      return;
    }
    setIsLoading(true);
    resetOfflineOutputs();
    resetMessages();
    try {
      sessionRef.current?.dispose();
      const session = await createHostOfflineSession(playerName.trim(), {
        onReady: onOfflineGameReady,
        onStateChanged: onOfflineStateChanged,
        onStatus: setStatus,
        onError: setError,
        onLobbyChanged: setOfflineLobbyView,
      }, { restoreLastHost });
      sessionRef.current = session;
      setRoomCode(session.roomId);
      setHostOffer(session.offerText);
      setHostInviteText(session.inviteText);
      setHostJoinUrl(session.joinUrl);
      setHostRelayInviteId(session.relayInviteId ?? '');
      setHostRelayError(session.relayError ?? '');
      setOfflineLobbyView(session.getLobbyView());
      if (session.relayInviteId) {
        setStatus(restoreLastHost ? '已恢复 Host 快照并生成邀请，等待 Player 提交 answer。' : '已生成邀请。请让 Player 扫码/打开链接；收到 answer 后会自动连接。');
      } else if (session.relayError) {
        setStatus('已生成纯离线邀请。请把链接或 invite 发给 Player，再把 Player answer 粘贴回来。');
      } else {
        setStatus(restoreLastHost ? '已恢复 Host 快照并生成新邀请，请重新交换 answer。' : '已生成纯离线邀请。请把链接或 invite 发给 Player，再把 Player answer 粘贴回来。');
      }
    } catch (err) {
      setError(toFriendlyError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyHostAnswer = async () => {
    const session = sessionRef.current;
    if (!session || session.role !== 'host') {
      setError('请先在当前页面新建离线房间或恢复本机 Host 快照，再粘贴导入 Player answer。');
      return;
    }
    if (!hostAnswerInput.trim()) {
      setError('请粘贴 Player answer。');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await session.applyAnswer(hostAnswerInput);
      setOfflineLobbyView(session.getLobbyView());
      setStatus('已导入 Player answer，正在连接。');
    } catch (err) {
      setError(toFriendlyError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateOfflinePlayer = async () => {
    if (!playerName.trim()) {
      setError('请输入您的名称');
      return;
    }
    if (!playerOfferInput.trim()) {
      setError('请粘贴 Host 邀请链接、invite 或 offer。');
      return;
    }
    setIsLoading(true);
    setPlayerAnswer('');
    setPlayerAnswerInviteText('');
    setPlayerAnswerUrl('');
    setPlayerRelaySubmitted(false);
    setOfflineLobbyView(null);
    resetMessages();
    try {
      sessionRef.current?.dispose();
      const session = await createPlayerOfflineSession(playerName.trim(), playerOfferInput, {
        onReady: onOfflineGameReady,
        onStateChanged: onOfflineStateChanged,
        onStatus: setStatus,
        onError: setError,
        onLobbyChanged: setOfflineLobbyView,
      });
      sessionRef.current = session;
      setRoomCode(session.roomId);
      setPlayerAnswer(session.answerText);
      setPlayerAnswerInviteText(session.answerInviteText);
      setPlayerAnswerUrl(session.answerUrl);
      setPlayerRelaySubmitted(Boolean(session.relayAnswerSubmitted));
      setOfflineLobbyView(session.getLobbyView());
      setStatus(session.relayAnswerSubmitted ? 'answer 已通过 relay 提交，等待 Host 自动连接。' : 'answer 已生成。请复制给 Host 导入。');
    } catch (err) {
      setError(toFriendlyError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetReady = (ready: boolean) => {
    try {
      sessionRef.current?.setLobbyReady(ready);
    } catch (err) {
      setError(toFriendlyError(err));
    }
  };

  const handleStartOfflineGame = () => {
    try {
      sessionRef.current?.requestStartGame();
    } catch (err) {
      setError(toFriendlyError(err));
    }
  };

  const copyText = async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setStatus('已复制到剪贴板。');
    } catch {
      setStatus('浏览器无法自动复制，请手动选中文本复制。');
    }
  };

  const isOnlineJoinDisabled = isLoading || isWaiting || !isConnected || !playerName.trim();
  const onlineBackendNotice = getOnlineBackendNotice({
    isProduction: import.meta.env.PROD,
    hasExplicitBackend: hasExplicitOnlineBackend,
    isConnected,
  });

  return (
    <div className="min-h-screen bg-game-bg flex items-start justify-center p-3 sm:p-4 sm:items-center">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-4 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl font-serif text-game-primary mb-1 sm:mb-2">花见小路</h1>
          <p className="text-gray-500">双人卡牌对战</p>
        </div>
        <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 space-y-3 sm:space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
            <button type="button" onClick={() => switchMode('offline-p2p')} className={`py-2 rounded-lg text-sm font-medium ${mode === 'offline-p2p' ? 'bg-white shadow text-game-primary' : 'text-gray-600'}`}>离线 P2P 模式</button>
            <button type="button" onClick={() => switchMode('online')} className={`py-2 rounded-lg text-sm font-medium ${mode === 'online' ? 'bg-white shadow text-game-primary' : 'text-gray-600'}`}>在线服务器模式</button>
          </div>
          <ModeSummary mode={mode} isConnected={isConnected} hasExplicitOnlineBackend={hasExplicitOnlineBackend} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">您的名称</label>
            <input type="text" value={playerName} onChange={event => setPlayerName(event.target.value)} placeholder="请输入名称" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-game-primary focus:border-transparent outline-none" disabled={isLoading || isWaiting} maxLength={12} />
          </div>
          {mode === 'online' ? (
            <>
              {onlineBackendNotice && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm leading-relaxed">
                  <div className="font-medium mb-1">在线服务器模式当前不可用</div>
                  <div>{onlineBackendNotice}</div>
                  <button type="button" onClick={() => switchMode('offline-p2p')} className="mt-3 w-full py-2 rounded-lg bg-game-primary text-white font-medium">切换到离线 P2P 模式</button>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">房间号（可选）</label>
                <input type="text" value={roomCode} onChange={event => setRoomCode(event.target.value.toUpperCase())} placeholder="输入房间号加入现有房间" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-game-primary focus:border-transparent outline-none uppercase" disabled={isLoading || isWaiting} maxLength={6} />
              </div>
              <div className="space-y-3 pt-2">
                <button type="button" onClick={handleCreateRoom} disabled={isOnlineJoinDisabled} className={`w-full py-3 rounded-xl font-medium ${isOnlineJoinDisabled ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-game-primary text-white hover:bg-opacity-90 active:scale-95'}`}>{isLoading ? '正在加入...' : (isWaiting ? '等待对手加入...' : '开始在线游戏（需要服务器）')}</button>
                {roomCode.trim() && <button type="button" onClick={handleJoinExistingRoom} disabled={isOnlineJoinDisabled} className={`w-full py-3 rounded-xl font-medium ${isOnlineJoinDisabled ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-game-secondary text-white hover:bg-opacity-90 active:scale-95'}`}>加入房间 {roomCode}</button>}
              </div>
            </>
          ) : (
            <>
              <OfflineRoomInvite
                role={offlineRole}
                setRole={switchOfflineRole}
                isLoading={isLoading}
                hostOffer={hostOffer}
                hostInviteText={hostInviteText}
                hostJoinUrl={hostJoinUrl}
                hostRelayInviteId={hostRelayInviteId}
                hostRelayError={hostRelayError}
                hostAnswerInput={hostAnswerInput}
                setHostAnswerInput={setHostAnswerInput}
                playerOfferInput={playerOfferInput}
                setPlayerOfferInput={setPlayerOfferInput}
                playerAnswer={playerAnswer}
                playerAnswerInviteText={playerAnswerInviteText}
                playerAnswerUrl={playerAnswerUrl}
                playerRelaySubmitted={playerRelaySubmitted}
                savedP2PSession={savedP2PSession}
                hasHostSnapshot={Boolean(savedHostSnapshot)}
                onCreateNewHost={() => createOfflineHost(false)}
                onRestoreHost={() => createOfflineHost(true)}
                onApplyAnswer={handleApplyHostAnswer}
                onCreatePlayer={handleCreateOfflinePlayer}
                onCopy={copyText}
              />
              {offlineLobbyView && <OfflineReadyRoom view={offlineLobbyView} onSetReady={handleSetReady} onStartGame={handleStartOfflineGame} />}
            </>
          )}
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}
          {status && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
              {roomCode.trim() && <div className="font-medium">房间号：<span className="font-mono">{roomCode}</span></div>}
              <div className={roomCode.trim() ? 'mt-1' : ''}>{status}</div>
            </div>
          )}
          {roomCode.trim() && !status && savedRoomId && mode === 'online' && <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm"><div className="font-medium">房间号：<span className="font-mono">{roomCode}</span></div></div>}
        </div>
        <details className="mt-4 sm:mt-8 bg-white/50 rounded-xl p-3 sm:p-4 text-sm text-gray-600">
          <summary className="cursor-pointer font-medium text-gray-800">游戏规则</summary>
          <ul className="mt-2 space-y-1"><li>• 2人轮流抽取卡牌并执行行动</li><li>• 四种行动：密约、取舍、赠予、竞争</li><li>• 控制艺伎或累计足够魅力值即可获胜</li><li>• 最多进行3局比赛</li></ul>
        </details>
        <div className="mt-3 sm:mt-4 text-center text-xs text-gray-400">{mode === 'online' ? (isConnected ? '在线服务器：已连接' : '在线服务器：未连接') : '离线 P2P：不依赖游戏后端保存状态'}</div>
      </div>
    </div>
  );
};


const ModeSummary: React.FC<{ mode: LobbyMode; isConnected: boolean; hasExplicitOnlineBackend: boolean }> = ({ mode, isConnected, hasExplicitOnlineBackend }) => {
  const isOffline = mode === 'offline-p2p';
  const badge = isOffline ? '当前入口' : (isConnected ? '已连接' : '未连接');
  const badgeClass = isOffline
    ? 'bg-green-100 text-green-700'
    : isConnected
      ? 'bg-blue-100 text-blue-700'
      : 'bg-amber-100 text-amber-700';
  const title = isOffline ? '离线 P2P' : '在线服务器';
  const hint = isOffline
    ? '不是“无网络”：只是不依赖游戏后端保存状态。先创建邀请，再让另一台设备扫码或复制加入。'
    : '需要后端 Socket 服务；服务器不可用时请切回离线 P2P。';
  const backendHint = hasExplicitOnlineBackend ? '后端地址已配置，可手动切换在线模式。' : '未配置后端地址。';

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs sm:text-sm text-gray-700">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium text-gray-900">当前模式：{title}</div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${badgeClass}`}>{badge}</span>
      </div>
      <div className="mt-1">{hint}</div>
      {!isOffline && <div className="mt-1 text-xs text-gray-500">{backendHint}</div>}
    </div>
  );
};

function toFriendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : '离线 P2P 操作失败';
  if (message.includes('ICE') || message.includes('DataChannel') || message.includes('WebRTC')) return `${message} 请优先使用同一 Wi-Fi 或手机热点。`;
  if (message.includes('INVITE_NOT_FOUND') || message.includes('invite 不存在') || message.includes('邀请已过期')) return '邀请已过期，请重新创建离线房间。';
  return message;
}
