import React, { useEffect, useMemo, useState } from 'react';
import type { OfflineClientSessionSnapshot } from '../../p2p/storage';
import { QRCodeBox } from './QRCodeBox';

export type OfflineInviteRole = 'host' | 'player';

export interface OfflineRoomInviteProps {
  role: OfflineInviteRole;
  setRole: (role: OfflineInviteRole) => void;
  isLoading: boolean;
  hostOffer: string;
  hostInviteText: string;
  hostJoinUrl: string;
  hostRelayInviteId: string;
  hostRelayError: string;
  hostAnswerInput: string;
  setHostAnswerInput: (value: string) => void;
  playerOfferInput: string;
  setPlayerOfferInput: (value: string) => void;
  playerAnswer: string;
  playerAnswerInviteText: string;
  playerAnswerUrl: string;
  playerRelaySubmitted: boolean;
  savedP2PSession: OfflineClientSessionSnapshot | null;
  hasHostSnapshot: boolean;
  onCreateNewHost: () => void;
  onRestoreHost: () => void;
  onApplyAnswer: () => void;
  onCreatePlayer: () => void;
  onCopy: (value: string) => void;
}

export const OfflineRoomInvite: React.FC<OfflineRoomInviteProps> = props => (
  <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => props.setRole('host')} className={`py-2 rounded-xl border text-sm font-medium ${props.role === 'host' ? 'border-game-primary text-game-primary bg-white shadow-sm' : 'border-gray-200 text-gray-600'}`}>Host 创建</button>
      <button type="button" onClick={() => props.setRole('player')} className={`py-2 rounded-xl border text-sm font-medium ${props.role === 'player' ? 'border-game-primary text-game-primary bg-white shadow-sm' : 'border-gray-200 text-gray-600'}`}>Player 加入</button>
    </div>

    {props.savedP2PSession && (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        检测到本机快照：{props.savedP2PSession.role === 'host' ? 'Host' : 'Player'} / {props.savedP2PSession.playerId} / v{props.savedP2PSession.lastStateVersion}。断线后仍需重新交换连接信息。
      </div>
    )}

    <OfflineQuickHint role={props.role} />
    {props.role === 'host' ? <HostInvitePanel {...props} /> : <PlayerInvitePanel {...props} />}
  </div>
);

const OfflineQuickHint: React.FC<{ role: OfflineInviteRole }> = ({ role }) => (
  <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
    {role === 'host'
      ? '点“新建离线房间”后，下方会出现二维码、链接和 invite 文本；完整内容在弹窗里查看。'
      : '扫码或粘贴 Host invite 后生成 answer；relay 可用时会自动回传给 Host，手动 answer 也可在弹窗里复制。'}
    <details className="mt-1">
      <summary className="cursor-pointer text-blue-700">离线 P2P 是什么？</summary>
      <div className="mt-1 text-blue-700">
        不是“无网络”，而是不依赖游戏后端保存状态；两台设备仍需要能建立 P2P 连接，同一 Wi-Fi 或手机热点成功率最高。
      </div>
    </details>
  </div>
);

const HostInvitePanel: React.FC<OfflineRoomInviteProps> = props => {
  const hasActiveHostSession = Boolean(props.hostOffer);
  const hasHostAnswer = Boolean(props.hostAnswerInput.trim());
  const shouldShowAnswerImport = hasActiveHostSession || hasHostAnswer;
  const canApplyAnswer = hasActiveHostSession && hasHostAnswer && !props.isLoading;
  const inactiveAnswerHint = props.hasHostSnapshot
    ? '已读取 Player answer，但当前页面还没有活跃 Host 连接。请先点击上方“恢复 Host 快照”；恢复时 answer 会保留，然后再导入。'
    : '已读取 Player answer，但当前页面还没有活跃 Host 连接。请回到原 Host 设备/标签页，或先恢复对应 Host 快照后再导入。';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button type="button" onClick={props.onCreateNewHost} disabled={props.isLoading} className={`w-full py-3 rounded-xl font-medium ${props.isLoading ? 'bg-gray-300 text-gray-500' : 'bg-game-primary text-white'}`}>{props.isLoading ? '正在生成...' : '新建离线房间'}</button>
        <button type="button" onClick={props.onRestoreHost} disabled={props.isLoading || !props.hasHostSnapshot} className={`w-full py-3 rounded-xl font-medium ${props.isLoading || !props.hasHostSnapshot ? 'bg-gray-300 text-gray-500' : 'bg-game-secondary text-white'}`}>恢复 Host 快照</button>
      </div>

      {props.hostRelayInviteId && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
          relay 已开启：invite <span className="font-mono">{props.hostRelayInviteId}</span>。等待 Player 提交 answer。
        </div>
      )}
      {props.hostRelayError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          relay 不可用，已改用纯离线邀请。把链接或 invite 发给 Player，再粘贴 Player answer。
        </div>
      )}

      {props.hostJoinUrl && <QRCodeBox title={props.hostRelayInviteId ? '给 Player 扫码/打开' : '给 Player 的离线链接'} value={props.hostJoinUrl} copyLabel="复制链接" onCopy={props.onCopy} />}
      {props.hostInviteText && <SignalBox label="invite 文本" value={props.hostInviteText} copyLabel="复制 invite" onCopy={() => props.onCopy(props.hostInviteText)} />}
      {props.hostOffer && (
        <details className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-700">高级：旧版 Host offer</summary>
          <div className="mt-3">
            <SignalBox label="Host offer" value={props.hostOffer} copyLabel="复制 offer" onCopy={() => props.onCopy(props.hostOffer)} />
          </div>
        </details>
      )}
      {shouldShowAnswerImport && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="block text-sm font-medium text-gray-700">粘贴 Player answer</label>
            {!hasActiveHostSession && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700">需先恢复 Host</span>}
          </div>
          {!hasActiveHostSession && hasHostAnswer && (
            <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{inactiveAnswerHint}</div>
          )}
          {hasActiveHostSession && (
            <div className="mb-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
              relay 自动回传失败或不可用时，把 Player 生成的 answer 粘贴到这里再导入。
            </div>
          )}
          <textarea
            value={props.hostAnswerInput}
            onChange={event => props.setHostAnswerInput(event.target.value)}
            placeholder={hasActiveHostSession ? '粘贴 Player 设备生成的 answer。' : '已从链接读取到的 Player answer 会显示在这里。'}
            disabled={props.isLoading}
            className="w-full h-24 sm:h-32 px-3 py-2 border border-gray-300 rounded-xl bg-white text-xs font-mono focus:ring-2 focus:ring-game-primary focus:border-transparent outline-none"
          />
          <button type="button" onClick={props.onApplyAnswer} disabled={!canApplyAnswer} className={`mt-2 w-full py-3 rounded-xl font-medium ${!canApplyAnswer ? 'bg-gray-300 text-gray-500' : 'bg-game-secondary text-white'}`}>{hasActiveHostSession ? '导入 answer 并连接' : '先恢复 Host 快照'}</button>
        </div>
      )}
    </div>
  );
};

const PlayerInvitePanel: React.FC<OfflineRoomInviteProps> = props => (
  <div className="space-y-3">
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">Host 邀请链接 / invite</label>
      <textarea value={props.playerOfferInput} onChange={event => props.setPlayerOfferInput(event.target.value)} placeholder="扫码打开会自动填入；也可以粘贴 Host 链接、HANA-INVITE-V1 invite 或旧 offer。" className="w-full h-24 sm:h-32 px-3 py-2 border border-gray-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-game-primary focus:border-transparent outline-none" />
    </div>
    <button type="button" onClick={props.onCreatePlayer} disabled={props.isLoading || !props.playerOfferInput.trim()} className={`w-full py-3 rounded-xl font-medium ${props.isLoading || !props.playerOfferInput.trim() ? 'bg-gray-300 text-gray-500' : 'bg-game-primary text-white'}`}>{props.isLoading ? '正在处理...' : '加入并生成 answer'}</button>
    {props.playerRelaySubmitted && (
      <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
        answer 已通过 relay 提交，等待 Host 自动连接。
      </div>
    )}
    {props.playerAnswerInviteText && <QRCodeBox title={props.playerRelaySubmitted ? 'answer 兜底文本' : '复制给 Host 的 answer'} value={props.playerAnswerInviteText} copyLabel="复制 answer" onCopy={props.onCopy} />}
    {props.playerAnswerUrl && <SignalBox label="answer URL" value={props.playerAnswerUrl} copyLabel="复制 URL" onCopy={() => props.onCopy(props.playerAnswerUrl)} />}
    {props.playerAnswer && (
      <details className="rounded-xl border border-gray-200 bg-gray-50 p-3">
        <summary className="cursor-pointer text-sm font-medium text-gray-700">高级：旧版 Player answer</summary>
        <div className="mt-3">
          <SignalBox label="Player answer" value={props.playerAnswer} copyLabel="复制 answer" onCopy={() => props.onCopy(props.playerAnswer)} />
        </div>
      </details>
    )}
  </div>
);

const SignalBox: React.FC<{ label: string; value: string; copyLabel?: string; onCopy: () => void }> = ({ label, value, copyLabel = '复制', onCopy }) => {
  const [isOpen, setIsOpen] = useState(false);
  const preview = useMemo(() => compactSignalPreview(value), [value]);

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-700">{label}</div>
            <div className="text-xs text-gray-500">长度：{value.length}</div>
          </div>
          <button type="button" onClick={onCopy} className="shrink-0 text-xs text-game-primary hover:underline">{copyLabel}</button>
        </div>
        <div className="mt-2 max-h-16 overflow-hidden break-all rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-gray-700">
          {preview}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCopy} className="rounded-lg border border-game-primary/30 px-3 py-2 text-xs font-medium text-game-primary">{copyLabel}</button>
          <button type="button" onClick={() => setIsOpen(true)} className="rounded-lg bg-game-primary px-3 py-2 text-xs font-medium text-white">查看完整文本</button>
        </div>
      </div>
      {isOpen && (
        <SignalTextModal
          label={label}
          value={value}
          copyLabel={copyLabel}
          onCopy={onCopy}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
};

const SignalTextModal: React.FC<{ label: string; value: string; copyLabel: string; onCopy: () => void; onClose: () => void }> = ({ label, value, copyLabel, onCopy, onClose }) => {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`${label}完整文本`} onClick={onClose}>
      <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl sm:p-5" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-gray-900">{label}</div>
            <div className="text-xs text-gray-500">长度：{value.length}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-sm text-gray-500 hover:bg-gray-100">关闭</button>
        </div>
        <div className="mt-4">
          <textarea
            readOnly
            value={value}
            onFocus={event => event.currentTarget.select()}
            className="h-72 max-h-[60dvh] w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-game-primary"
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCopy} className="rounded-xl bg-game-primary py-3 text-sm font-medium text-white">{copyLabel}</button>
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-700">完成</button>
        </div>
      </div>
    </div>
  );
};

function compactSignalPreview(value: string): string {
  return value.length > 320 ? `${value.slice(0, 320)}...` : value;
}
