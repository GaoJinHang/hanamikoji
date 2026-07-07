import type { P2PEnvelope, P2PMessage } from '../protocol';
import type {
  TransportEndpoint,
  TransportMessageHandler,
  TransportStatusHandler,
  TransportUnsubscribe,
} from './types';

export class MemoryTransport {
  private readonly endpoints = new Map<string, MemoryEndpoint>();

  createEndpoint(peerId: string): TransportEndpoint {
    if (this.endpoints.has(peerId)) throw new Error(`Memory endpoint already exists: ${peerId}`);
    const endpoint = new MemoryEndpoint(peerId, this);
    this.endpoints.set(peerId, endpoint);
    return endpoint;
  }

  removeEndpoint(peerId: string): void {
    this.endpoints.delete(peerId);
  }

  deliver(envelope: P2PEnvelope): void {
    const target = this.endpoints.get(envelope.toPeerId);
    const source = this.endpoints.get(envelope.fromPeerId);
    if (!target || !source) throw new Error('MemoryTransport endpoint not found');
    if (!source.isOnline) throw new Error(`MemoryTransport source offline: ${envelope.fromPeerId}`);
    if (!target.isOnline) throw new Error(`MemoryTransport target offline: ${envelope.toPeerId}`);
    target.receive(envelope);
  }

  notifyDisconnect(peerId: string): void {
    for (const [id, endpoint] of this.endpoints.entries()) {
      if (id !== peerId && endpoint.isOnline) endpoint.receiveDisconnect(peerId);
    }
  }

  notifyReconnect(peerId: string): void {
    for (const [id, endpoint] of this.endpoints.entries()) {
      if (id !== peerId && endpoint.isOnline) endpoint.receiveReconnect(peerId);
    }
  }
}

class MemoryEndpoint implements TransportEndpoint {
  private readonly messageHandlers = new Set<TransportMessageHandler>();
  private readonly disconnectHandlers = new Set<TransportStatusHandler>();
  private readonly reconnectHandlers = new Set<TransportStatusHandler>();
  private online = true;

  constructor(
    readonly peerId: string,
    private readonly transport: MemoryTransport,
  ) {}

  get isOnline(): boolean {
    return this.online;
  }

  send(toPeerId: string, message: P2PMessage): void {
    this.transport.deliver({ fromPeerId: this.peerId, toPeerId, message });
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
    if (!this.online) return;
    this.online = false;
    this.transport.notifyDisconnect(this.peerId);
  }

  reconnect(): void {
    if (this.online) return;
    this.online = true;
    this.transport.notifyReconnect(this.peerId);
  }

  receive(envelope: P2PEnvelope): void {
    for (const handler of [...this.messageHandlers]) handler(envelope);
  }

  receiveDisconnect(peerId: string): void {
    for (const handler of [...this.disconnectHandlers]) handler(peerId);
  }

  receiveReconnect(peerId: string): void {
    for (const handler of [...this.reconnectHandlers]) handler(peerId);
  }
}
