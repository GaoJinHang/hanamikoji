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
        setStatus('已从 URL hash 读取 relay 一次扫码邀请。请填写昵称并点击“加入并提交 answer”。relay 只交换 offer/answer，不保存手牌、EngineState、eventLog 或游戏动作。');
      } else {
        setPlayerOfferInput(parsed.signalText);
        setStatus('已从 URL hash 读取纯离线邀请。请填写昵称并点击“生成 Player answer”；当前纯离线兜底仍需要 Host 当前页面粘贴 answer。');
      }
    } else {
      setOfflineRole('host');
      setHostAnswerInput(parsed.signalText);
      setStatus('已从 URL hash 读取 Player answer。请在当前 Host 页面创建/恢复本机 Host 快照后粘贴导入；新开标签页无法拿到原 RTCPeerConnection，当前 MVP 不承诺完整扫码恢复。');
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
        setStatus(restoreLastHost ? '已读取本机 Host 快照并生成 relay 一次扫码邀请，正在等待 Player 提交 answer。relay 只交换连接信息（offer/answer），不保存手牌、EngineState、eventLog 或游戏动作；relay 不等于公网穿透，同一 Wi-Fi / 手机热点是优先支持场景，跨运营商网络可能需要 STUN/TURN。' : '已新建离线房间并生成 relay 一次扫码邀请，正在等待 Player 提交 answer。relay 只交换连接信息（offer/answer），不保存手牌、EngineState、eventLog 或游戏动作；relay 不等于公网穿透，同一 Wi-Fi / 手机热点是优先支持场景，跨运营商网络可能需要 STUN/TURN。');
      } else if (session.relayError) {
        setStatus(`Relay 创建失败，已回退到纯离线长邀请；当前纯离线兜底仍需要 Host 当前页面粘贴 Player answer。原因：${session.relayError}`);
      } else {
        setStatus(restoreLastHost ? '已读取本机 Host 快照并生成新的纯离线邀请；这不是恢复原 WebRTC 连接，请让 Player 重新生成 answer，并在 Host 当前页面粘贴导入。' : '已新建离线房间并生成纯离线邀请。Player 可以打开链接/扫码读取 Host invite；Host 当前页面仍需粘贴 Player answer。');
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
      setStatus('已导入 Player answer，正在连接。若长时间未连接，请确认两台设备在同一 Wi-Fi / 手机热点内；跨运营商网络可能需要 STUN/TURN。');
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
      setStatus(session.relayAnswerSubmitted ? '已通过 relay 提交 answer，等待 Host 当前页面自动建立连接。relay 只交换连接信息（offer/answer），不保存手牌、EngineState、eventLog 或游戏动作；relay 不等于公网穿透，同一 Wi-Fi / 手机热点是优先支持场景，跨运营商网络可能需要 STUN/TURN。' : 'Player answer 已生成。当前纯离线兜底需要复制回 Host 当前页面粘贴导入，连接后进入 Ready 房间。');
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
  const showFrontendOnlyOfflineNotice = import.meta.env.PROD && !hasExplicitOnlineBackend;

  return (
    <div className="min-h-screen bg-game-bg flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-serif text-game-primary mb-2">花见小路</h1>
          <p className="text-gray-500">双人卡牌对战</p>
        </div>
        <div className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
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
              {showFrontendOnlyOfflineNotice && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm leading-relaxed">
                  <div className="font-medium mb-1">离线 P2P 已作为当前入口</div>
                  <div>直接登录部署链接会优先进入离线 P2P。你可以新建 Host 邀请，让另一台设备扫码/打开链接；没有 relay 后端时会自动回退到复制 invite / answer 的纯离线流程。</div>
                </div>
              )}
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
          {roomCode.trim() && status && <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm"><div className="font-medium">房间号：<span className="font-mono">{roomCode}</span></div><div className="mt-1">{status}</div></div>}
          {roomCode.trim() && !status && savedRoomId && mode === 'online' && <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm"><div className="font-medium">房间号：<span className="font-mono">{roomCode}</span></div></div>}
        </div>
        <div className="mt-8 bg-white/50 rounded-xl p-4 text-sm text-gray-600">
          <h3 className="font-medium text-gray-800 mb-2">游戏规则</h3>
          <ul className="space-y-1"><li>• 2人轮流抽取卡牌并执行行动</li><li>• 四种行动：密约、取舍、赠予、竞争</li><li>• 控制艺伎或累计足够魅力值即可获胜</li><li>• 最多进行3局比赛</li></ul>
        </div>
        <div className="mt-4 text-center text-xs text-gray-400">{mode === 'online' ? (isConnected ? '在线服务器：已连接' : '在线服务器：未连接') : '离线 P2P：游戏动作走点对点 DataChannel；同一 Wi-Fi / 手机热点优先'}</div>
      </div>
    </div>
  );
};


const ModeSummary: React.FC<{ mode: LobbyMode; isConnected: boolean; hasExplicitOnlineBackend: boolean }> = ({ mode, isConnected, hasExplicitOnlineBackend }) => {
  const isOffline = mode === 'offline-p2p';
  const badge = isOffline ? '当前入口' : (isConnected ? '服务器已连接' : '服务器未连接');
  const badgeClass = isOffline
    ? 'bg-green-100 text-green-700'
    : isConnected
      ? 'bg-blue-100 text-blue-700'
      : 'bg-amber-100 text-amber-700';
  const title = isOffline ? '离线 P2P 模式' : '在线服务器模式';
  const description = isOffline
    ? '适合部署登录链接默认进入：两台设备通过邀请链接/二维码交换连接信息，连接后游戏动作走点对点 DataChannel。'
    : '适合已有稳定后端 Socket 服务的房间创建/加入流程；如果服务器未连接，可以随时切回离线 P2P。';
  const backendHint = hasExplicitOnlineBackend
    ? '已检测到后端地址，在线模式可手动切换使用。'
    : '未配置后端地址，在线模式只作为备用入口显示。';

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 leading-relaxed">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium text-gray-900">当前模式：{title}</div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${badgeClass}`}>{badge}</span>
      </div>
      <div className="mt-1">{description}</div>
      <div className="mt-1 text-xs text-gray-500">{backendHint}</div>
    </div>
  );
};

function toFriendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : '离线 P2P 操作失败';
  if (message.includes('ICE') || message.includes('DataChannel') || message.includes('WebRTC')) return `${message} relay 不等于公网穿透；请优先让两台设备处于同一 Wi-Fi / 手机热点，跨运营商网络可能需要 STUN/TURN。当前断线后需要重新交换 offer/answer，完整扫码恢复不是当前 MVP 承诺。`;
  if (message.includes('INVITE_NOT_FOUND') || message.includes('invite 不存在') || message.includes('邀请已过期')) return '邀请已过期，请重新创建离线房间。';
  return message;
}
