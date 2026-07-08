import type { P2PEnvelope, P2PMessage, WebRTCSignalPayload } from '../protocol';
import type {
  TransportEndpoint,
  TransportMessageHandler,
  TransportStatusHandler,
  TransportUnsubscribe,
} from './types';

export interface WebRTCOfferOptions {
  hostPeerId: string;
  remotePeerId: string;
  roomId: string;
  iceServers?: RTCIceServer[];
}

export interface WebRTCAcceptOfferOptions {
  offer: WebRTCSignalPayload;
  iceServers?: RTCIceServer[];
}

const SIGNAL_KIND = 'hanamikoji-webrtc-signal' as const;
const CHANNEL_LABEL = 'hanamikoji-p2p';
const ICE_GATHERING_TIMEOUT_MS = 10_000;
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

/**
 * Browser WebRTC DataChannel endpoint for one remote peer.
 * Signaling stays external so the app can use copy/paste first and QR later.
 */
export class WebRTCDataChannelEndpoint implements TransportEndpoint {
  private readonly messageHandlers = new Set<TransportMessageHandler>();
  private readonly disconnectHandlers = new Set<TransportStatusHandler>();
  private readonly reconnectHandlers = new Set<TransportStatusHandler>();
  private readonly pendingMessages: P2PMessage[] = [];
  private channel: RTCDataChannel | null = null;
  private readonly pendingFrames: string[] = [];
  private online = false;
  private closed = false;

  constructor(
    readonly peerId: string,
    private readonly remotePeerId: string,
    private readonly peerConnection: RTCPeerConnection,
    channel?: RTCDataChannel,
  ) {
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      if (state === 'connected') this.markReconnected();
      if (state === 'disconnected' || state === 'failed' || state === 'closed') this.markDisconnected();
    };
    this.peerConnection.ondatachannel = event => this.attachChannel(event.channel);
    if (channel) this.attachChannel(channel);
  }

  static async createOffer(options: WebRTCOfferOptions): Promise<{ endpoint: WebRTCDataChannelEndpoint; signal: WebRTCSignalPayload }> {
    const peerConnection = createPeerConnection(options.iceServers);
    const channel = peerConnection.createDataChannel(CHANNEL_LABEL, { ordered: true });
    const endpoint = new WebRTCDataChannelEndpoint(options.hostPeerId, options.remotePeerId, peerConnection, channel);

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await waitForIceGatheringComplete(peerConnection);

    const description = peerConnection.localDescription;
    if (!description) throw new Error('无法生成 WebRTC offer。');

    return {
      endpoint,
      signal: {
        kind: SIGNAL_KIND,
        version: 1,
        role: 'host-offer',
        roomId: options.roomId,
        hostPeerId: options.hostPeerId,
        remotePeerId: options.remotePeerId,
        description: { type: description.type, sdp: description.sdp },
        createdAt: Date.now(),
      },
    };
  }

  static async acceptOffer(options: WebRTCAcceptOfferOptions): Promise<{ endpoint: WebRTCDataChannelEndpoint; signal: WebRTCSignalPayload }> {
    const offer = options.offer;
    if (offer.kind !== SIGNAL_KIND || offer.version !== 1 || offer.role !== 'host-offer' || offer.description.type !== 'offer') {
      throw new Error('信令格式无效：请粘贴 Host offer。');
    }

    const peerConnection = createPeerConnection(options.iceServers);
    const endpoint = new WebRTCDataChannelEndpoint(offer.remotePeerId, offer.hostPeerId, peerConnection);

    await peerConnection.setRemoteDescription(offer.description);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    await waitForIceGatheringComplete(peerConnection);

    const description = peerConnection.localDescription;
    if (!description) throw new Error('无法生成 WebRTC answer。');

    return {
      endpoint,
      signal: {
        kind: SIGNAL_KIND,
        version: 1,
        role: 'player-answer',
        roomId: offer.roomId,
        hostPeerId: offer.hostPeerId,
        remotePeerId: offer.remotePeerId,
        description: { type: description.type, sdp: description.sdp },
        createdAt: Date.now(),
      },
    };
  }

  async applyAnswer(answer: WebRTCSignalPayload): Promise<void> {
    if (answer.kind !== SIGNAL_KIND || answer.version !== 1 || answer.role !== 'player-answer' || answer.description.type !== 'answer') {
      throw new Error('信令格式无效：请粘贴 Player answer。');
    }
    if (answer.hostPeerId !== this.peerId || answer.remotePeerId !== this.remotePeerId) {
      throw new Error('信令不匹配：answer 不属于当前离线房间。');
    }

    const activeRemoteAnswer = this.peerConnection.currentRemoteDescription?.type === 'answer'
      ? this.peerConnection.currentRemoteDescription
      : this.peerConnection.remoteDescription?.type === 'answer'
        ? this.peerConnection.remoteDescription
        : null;

    if (activeRemoteAnswer) {
      if (!activeRemoteAnswer.sdp || activeRemoteAnswer.sdp === answer.description.sdp) return;
      throw new Error('当前 Host 已导入过另一份 Player answer。请重新创建离线房间并重新交换邀请。');
    }

    if (this.peerConnection.signalingState === 'stable') {
      throw new Error('当前 WebRTC 连接已经处于 stable 状态。请不要重复导入 answer；若仍未连接，请重新创建离线房间。');
    }

    try {
      await this.peerConnection.setRemoteDescription(answer.description);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (String(this.peerConnection.signalingState) === 'stable' && message.includes('stable')) return;
      throw error;
    }
  }

  get isOnline(): boolean {
    return this.online && !this.closed;
  }

  attachChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    if (channel.readyState === 'open') this.markReconnected();
    channel.onopen = () => this.markReconnected();
    channel.onclose = () => this.markDisconnected();
    channel.onerror = () => this.markDisconnected();
    channel.onmessage = (event: MessageEvent<string>) => {
      try {
        const envelope = JSON.parse(event.data) as P2PEnvelope;
        if (envelope.toPeerId !== this.peerId || envelope.fromPeerId !== this.remotePeerId) return;
        for (const handler of [...this.messageHandlers]) handler(envelope);
      } catch {
        // Ignore invalid transport frames. Protocol errors are handled by runtimes.
      }
    };
    if (this.online) this.flushPending();
  }

  send(toPeerId: string, message: P2PMessage): void {
    if (toPeerId !== this.remotePeerId) throw new Error(`No WebRTC route to ${toPeerId}`);
    if (!this.channel || this.channel.readyState !== 'open') {
      this.pendingMessages.push(message);
      return;
    }
    this.channel.send(JSON.stringify({ fromPeerId: this.peerId, toPeerId, message } satisfies P2PEnvelope));
  }

  onMessage(handler: TransportMessageHandler): TransportUnsubscribe {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onDisconnect(handler: TransportStatusHandler): TransportUnsubscribe {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  onReconnect(handler: TransportStatusHandler): TransportUnsubscribe {
    this.reconnectHandlers.add(handler);
    return () => this.reconnectHandlers.delete(handler);
  }

  disconnect(): void {
    if (this.closed) return;
    this.closed = true;
    this.channel?.close();
    this.peerConnection.close();
    this.markDisconnected(true);
  }

  reconnect(): void {
    // A real reconnect is a fresh RTCPeerConnection + DataChannel + manual signal exchange.
  }

  private markReconnected(): void {
    if (this.closed) return;
    const wasOnline = this.online;
    this.online = true;
    this.flushPending();
    if (!wasOnline) for (const handler of [...this.reconnectHandlers]) handler(this.remotePeerId);
  }

  private markDisconnected(force = false): void {
    if (!this.online && !force) return;
    this.online = false;
    for (const handler of [...this.disconnectHandlers]) handler(this.remotePeerId);
  }

  private flushPending(): void {
    while (this.channel?.readyState === 'open' && this.pendingMessages.length > 0) {
      this.send(this.remotePeerId, this.pendingMessages.shift()!);
    }
  }
}

function createPeerConnection(iceServers?: RTCIceServer[]): RTCPeerConnection {
  if (typeof RTCPeerConnection === 'undefined') {
    throw new Error('当前浏览器不支持 WebRTC DataChannel。');
  }
  return new RTCPeerConnection({ iceServers: iceServers?.length ? iceServers : DEFAULT_ICE_SERVERS });
}

async function waitForIceGatheringComplete(peerConnection: RTCPeerConnection): Promise<void> {
  if (peerConnection.iceGatheringState === 'complete') return;

  await new Promise<void>(resolve => {
    const timeoutId = globalThis.setTimeout(() => {
      cleanup();
      // Invite creation must not fail just because ICE gathering is slow or
      // browser/network-specific. The current localDescription still contains
      // the best offer/answer gathered so far; connection success can be
      // handled after the invite is visible to the user.
      resolve();
    }, ICE_GATHERING_TIMEOUT_MS);

    const cleanup = () => {
      peerConnection.removeEventListener('icegatheringstatechange', onChange);
      globalThis.clearTimeout(timeoutId);
    };

    const onChange = () => {
      if (peerConnection.iceGatheringState !== 'complete') return;
      cleanup();
      resolve();
    };

    peerConnection.addEventListener('icegatheringstatechange', onChange);
  });
}
