import React from 'react';
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
      ? '点“新建离线房间”后，下方会出现二维码、链接和 invite 文本。'
      : '扫码或粘贴 Host invite 后生成 answer；relay 可用时会自动回传给 Host。'}
    <details className="mt-1">
      <summary className="cursor-pointer text-blue-700">离线 P2P 是什么？</summary>
      <div className="mt-1 text-blue-700">
        不是“无网络”，而是不依赖游戏后端保存状态；两台设备仍需要能建立 P2P 连接，同一 Wi-Fi 或手机热点成功率最高。
      </div>
    </details>
  </div>
);

const HostInvitePanel: React.FC<OfflineRoomInviteProps> = props => (
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
    {props.hostInviteText && <SignalBox label="invite 文本" value={props.hostInviteText} onCopy={() => props.onCopy(props.hostInviteText)} />}
    {props.hostOffer && (
      <details className="rounded-xl border border-gray-200 bg-gray-50 p-3">
        <summary className="cursor-pointer text-sm font-medium text-gray-700">高级：旧版 Host offer</summary>
        <div className="mt-3">
          <SignalBox label="Host offer" value={props.hostOffer} onCopy={() => props.onCopy(props.hostOffer)} />
        </div>
      </details>
    )}
    {props.hostOffer && (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">粘贴 Player answer</label>
        <textarea value={props.hostAnswerInput} onChange={event => props.setHostAnswerInput(event.target.value)} placeholder="relay 不可用时，把 Player 设备生成的 answer 粘贴到这里。" className="w-full h-20 sm:h-28 px-3 py-2 border border-gray-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-game-primary focus:border-transparent outline-none" />
        <button type="button" onClick={props.onApplyAnswer} disabled={props.isLoading || !props.hostAnswerInput.trim()} className={`mt-2 w-full py-3 rounded-xl font-medium ${props.isLoading || !props.hostAnswerInput.trim() ? 'bg-gray-300 text-gray-500' : 'bg-game-secondary text-white'}`}>导入 answer 并连接</button>
      </div>
    )}
  </div>
);

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
    {props.playerAnswerUrl && <SignalBox label="answer URL" value={props.playerAnswerUrl} onCopy={() => props.onCopy(props.playerAnswerUrl)} />}
    {props.playerAnswer && (
      <details className="rounded-xl border border-gray-200 bg-gray-50 p-3">
        <summary className="cursor-pointer text-sm font-medium text-gray-700">高级：旧版 Player answer</summary>
        <div className="mt-3">
          <SignalBox label="Player answer" value={props.playerAnswer} onCopy={() => props.onCopy(props.playerAnswer)} />
        </div>
      </details>
    )}
  </div>
);

const SignalBox: React.FC<{ label: string; value: string; onCopy: () => void }> = ({ label, value, onCopy }) => (
  <div>
    <div className="flex items-center justify-between mb-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <button type="button" onClick={onCopy} className="text-xs text-game-primary hover:underline">复制</button>
    </div>
    <textarea readOnly value={value} className="w-full h-20 sm:h-28 px-3 py-2 border border-gray-300 rounded-xl bg-gray-50 text-xs font-mono" />
  </div>
);
