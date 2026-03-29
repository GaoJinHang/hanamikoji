import { parseClientMessage, serializeServerMessage } from '../core/protocol';
import type { ClientMessage } from '../core/protocol';
import type { ISocket } from './ISocket';

export class WorkerSocket implements ISocket {
  private messageHandler?: (message: ClientMessage) => void;
  private closeHandler?: () => void;

  constructor(private readonly ws: WebSocket) {}

  send(message: import('../core/protocol').ServerMessage): void {
    this.ws.send(serializeServerMessage(message));
  }

  onMessage(handler: (message: ClientMessage) => void): void {
    this.messageHandler = handler;
    this.ws.addEventListener('message', this.handleRawMessage as EventListener);
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
    this.ws.addEventListener('close', () => handler());
    this.ws.addEventListener('error', () => handler());
  }

  close(): void {
    this.ws.close(1000, 'closed');
  }

  private handleRawMessage = (event: MessageEvent): void => {
    const message = parseClientMessage(event.data);
    if (!message) {
      this.send({ type: 'error', payload: { message: '消息格式错误' } });
      return;
    }

    this.messageHandler?.(message);
  };
}
