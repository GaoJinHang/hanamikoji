import type { P2PEnvelope, P2PMessage } from '../protocol';

export type TransportUnsubscribe = () => void;
export type TransportMessageHandler = (envelope: P2PEnvelope) => void;
export type TransportStatusHandler = (peerId: string) => void;

export interface TransportEndpoint {
  readonly peerId: string;
  readonly isOnline: boolean;
  send(toPeerId: string, message: P2PMessage): void;
  onMessage(handler: TransportMessageHandler): TransportUnsubscribe;
  onDisconnect(handler: TransportStatusHandler): TransportUnsubscribe;
  onReconnect(handler: TransportStatusHandler): TransportUnsubscribe;
  disconnect(): void;
  reconnect(): void;
}
