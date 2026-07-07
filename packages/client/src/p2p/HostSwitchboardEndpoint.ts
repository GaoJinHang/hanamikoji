import type {
  P2PEnvelope,
  P2PMessage,
  TransportEndpoint,
  TransportMessageHandler,
  TransportStatusHandler,
  TransportUnsubscribe,
} from '@hanamikoji/p2p';

interface RouteRecord {
  endpoint: TransportEndpoint;
  unsubscribe: TransportUnsubscribe[];
}

export class HostSwitchboardEndpoint implements TransportEndpoint {
  readonly peerId: string;

  private readonly routes = new Map<string, RouteRecord>();
  private readonly messageHandlers = new Set<TransportMessageHandler>();
  private readonly disconnectHandlers = new Set<TransportStatusHandler>();
  private readonly reconnectHandlers = new Set<TransportStatusHandler>();
  private online = true;

  constructor(peerId: string) {
    this.peerId = peerId;
  }

  get isOnline(): boolean {
    return this.online;
  }

  addRoute(toPeerId: string, endpoint: TransportEndpoint): void {
    this.removeRoute(toPeerId);
    const unsubscribe = [
      endpoint.onMessage(envelope => this.receive(envelope)),
      endpoint.onDisconnect(peerId => this.emitDisconnect(peerId)),
      endpoint.onReconnect(peerId => this.emitReconnect(peerId)),
    ];
    this.routes.set(toPeerId, { endpoint, unsubscribe });
  }

  removeRoute(toPeerId: string): void {
    const existing = this.routes.get(toPeerId);
    if (!existing) return;
    existing.unsubscribe.forEach(unsubscribe => unsubscribe());
    existing.endpoint.disconnect();
    this.routes.delete(toPeerId);
  }

  send(toPeerId: string, message: P2PMessage): void {
    const route = this.routes.get(toPeerId);
    if (!route) throw new Error(`Host P2P route not found: ${toPeerId}`);
    route.endpoint.send(toPeerId, message);
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
    for (const peerId of [...this.routes.keys()]) this.removeRoute(peerId);
  }

  reconnect(): void {
    if (this.online) return;
    this.online = true;
  }

  private receive(envelope: P2PEnvelope): void {
    if (envelope.toPeerId !== this.peerId) return;
    for (const handler of [...this.messageHandlers]) handler(envelope);
  }

  private emitDisconnect(peerId: string): void {
    for (const handler of [...this.disconnectHandlers]) handler(peerId);
  }

  private emitReconnect(peerId: string): void {
    for (const handler of [...this.reconnectHandlers]) handler(peerId);
  }
}
