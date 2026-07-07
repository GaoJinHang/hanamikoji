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
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => props.setRole('host')} className={`py-2 rounded-xl border text-sm font-medium ${props.role === 'host' ? 'border-game-primary text-game-primary bg-white' : 'border-gray-200 text-gray-600'}`}>创建离线房间（Host）</button>
      <button type="button" onClick={() => props.setRole('player')} className={`py-2 rounded-xl border text-sm font-medium ${props.role === 'player' ? 'border-game-primary text-game-primary bg-white' : 'border-gray-200 text-gray-600'}`}>加入离线房间（Player）</button>
    </div>
    {props.savedP2PSession && (
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
        检测到本机离线恢复信息：{props.savedP2PSession.role === 'host' ? 'Host' : 'Player'} / {props.savedP2PSession.playerId} / v{props.savedP2PSession.lastStateVersion}。
        {props.hasHostSnapshot ? ' Host 本机也保存了权威快照。' : ''} 这只恢复本机快照；断线后仍需重新交换 offer/answer，不代表 Player 重新扫码一定能恢复。
      </div>
    )}
    <RelayBoundaryNotice />
    {props.role === 'host' ? <HostInvitePanel {...props} /> : <PlayerInvitePanel {...props} />}
    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 text-xs leading-relaxed">
      relay 只负责交换连接信息（offer/answer），不保存手牌、EngineState、eventLog 或游戏动作；relay 不等于公网穿透。同一 Wi-Fi / 手机热点是优先支持场景；跨运营商网络可能需要 STUN/TURN，但不要把第三方 TURN 凭据硬编码到源码里。当前断线后需要重新交换 offer/answer，完整扫码恢复不是当前 MVP 承诺。
    </div>
  </div>
);

const RelayBoundaryNotice: React.FC = () => (
  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-xs leading-relaxed">
    离线 P2P 对局：relay 只交换连接信息（offer/answer），不保存手牌、EngineState、eventLog 或游戏动作，也不等于公网穿透。连接建立后，游戏动作通过两台设备之间的 P2P DataChannel 传输；同一 Wi-Fi / 手机热点成功率最高。
  </div>
);

const HostInvitePanel: React.FC<OfflineRoomInviteProps> = props => (
  <div className="space-y-3">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <button type="button" onClick={props.onCreateNewHost} disabled={props.isLoading} className={`w-full py-3 rounded-xl font-medium ${props.isLoading ? 'bg-gray-300 text-gray-500' : 'bg-game-primary text-white'}`}>{props.isLoading ? '正在生成邀请...' : '新建离线房间'}</button>
      <button type="button" onClick={props.onRestoreHost} disabled={props.isLoading || !props.hasHostSnapshot} className={`w-full py-3 rounded-xl font-medium ${props.isLoading || !props.hasHostSnapshot ? 'bg-gray-300 text-gray-500' : 'bg-game-secondary text-white'}`}>恢复本机 Host 快照</button>
    </div>
    <div className="text-xs text-gray-500">“新建离线房间”不会复用旧 Host snapshot；恢复本机快照需要你明确点击恢复按钮，但仍会生成新的 offer/answer 交换，不承诺 Player 重新扫码恢复。</div>

    {props.hostRelayInviteId && (
      <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-xs leading-relaxed">
        一次扫码 relay 已开启：invite <span className="font-mono">{props.hostRelayInviteId}</span>。Host 当前页面会每 1 秒轮询 Player answer，收到后自动导入；relay invite 被读取后会立即消费删除。
      </div>
    )}
    {props.hostRelayError && (
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs leading-relaxed">
        Relay 创建失败，已自动切换到纯离线长邀请。原因：{props.hostRelayError} 当前纯离线兜底仍需要 Host 当前页面粘贴 Player answer。
      </div>
    )}

    {props.hostJoinUrl && <QRCodeBox title={props.hostRelayInviteId ? '一次扫码 relay 加入链接 / 二维码' : '纯离线 Player 加入链接 / 二维码（Host 后续需粘贴 answer）'} value={props.hostJoinUrl} onCopy={props.onCopy} />}
    {props.hostInviteText && <SignalBox label="纯离线兜底：长 invite 文本（HANA-INVITE-V1）" value={props.hostInviteText} onCopy={() => props.onCopy(props.hostInviteText)} />}
    {props.hostOffer && <SignalBox label="高级兜底：旧版 Host offer（HANA-P2P-V1）" value={props.hostOffer} onCopy={() => props.onCopy(props.hostOffer)} />}
    {props.hostOffer && (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">粘贴 Player answer / answer invite</label>
        <textarea value={props.hostAnswerInput} onChange={event => props.setHostAnswerInput(event.target.value)} placeholder="Relay 不可用或需要手动兜底时，把 Player 设备生成的 answer 粘贴到这里。当前 MVP 不支持 Host 摄像头扫码导入 answer，请保持在当前 Host 页面导入。" className="w-full h-28 px-3 py-2 border border-gray-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-game-primary focus:border-transparent outline-none" />
        <button type="button" onClick={props.onApplyAnswer} disabled={props.isLoading || !props.hostAnswerInput.trim()} className={`mt-2 w-full py-3 rounded-xl font-medium ${props.isLoading || !props.hostAnswerInput.trim() ? 'bg-gray-300 text-gray-500' : 'bg-game-secondary text-white'}`}>导入 answer 并连接</button>
      </div>
    )}
  </div>
);

const PlayerInvitePanel: React.FC<OfflineRoomInviteProps> = props => (
  <div className="space-y-3">
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">Host 邀请链接 / invite / 旧版 offer</label>
      <textarea value={props.playerOfferInput} onChange={event => props.setPlayerOfferInput(event.target.value)} placeholder="粘贴 relay 一次扫码链接、纯离线 HANA-INVITE-V1 邀请链接/文本，或旧 HANA-P2P-V1 offer" className="w-full h-32 px-3 py-2 border border-gray-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-game-primary focus:border-transparent outline-none" />
    </div>
    <button type="button" onClick={props.onCreatePlayer} disabled={props.isLoading || !props.playerOfferInput.trim()} className={`w-full py-3 rounded-xl font-medium ${props.isLoading || !props.playerOfferInput.trim() ? 'bg-gray-300 text-gray-500' : 'bg-game-primary text-white'}`}>{props.isLoading ? '正在生成 answer...' : '加入并生成 Player answer'}</button>
    {props.playerRelaySubmitted && (
      <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-xs leading-relaxed">
        已通过 relay 自动提交 Player answer。请等待 Host 当前页面自动建立 DataChannel；relay 不保存手牌、EngineState、eventLog 或游戏动作。
      </div>
    )}
    {props.playerAnswerInviteText && <QRCodeBox title={props.playerRelaySubmitted ? '手动兜底 answer 文本（通常无需复制）' : 'Player answer 文本（复制回 Host 当前页面粘贴）'} value={props.playerAnswerInviteText} onCopy={props.onCopy} />}
    {props.playerAnswerUrl && <SignalBox label="answer URL（高级备用；Host 仍建议在当前页面粘贴导入）" value={props.playerAnswerUrl} onCopy={() => props.onCopy(props.playerAnswerUrl)} />}
    {props.playerAnswer && <SignalBox label="高级兜底：旧版 Player answer（HANA-P2P-V1）" value={props.playerAnswer} onCopy={() => props.onCopy(props.playerAnswer)} />}
  </div>
);

const SignalBox: React.FC<{ label: string; value: string; onCopy: () => void }> = ({ label, value, onCopy }) => (
  <div>
    <div className="flex items-center justify-between mb-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <button type="button" onClick={onCopy} className="text-xs text-game-primary hover:underline">复制</button>
    </div>
    <textarea readOnly value={value} className="w-full h-28 px-3 py-2 border border-gray-300 rounded-xl bg-gray-50 text-xs font-mono" />
  </div>
);
