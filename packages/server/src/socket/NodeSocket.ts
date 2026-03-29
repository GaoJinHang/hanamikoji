import WebSocket, { type RawData } from 'ws';
import { parseClientMessage, serializeServerMessage } from '../core/protocol';
import type { ClientMessage } from '../core/protocol';
import type { ISocket } from './ISocket';

export class NodeSocket implements ISocket {
  private messageHandler?: (message: ClientMessage) => void;
  private closeHandler?: () => void;

  constructor(private readonly ws: WebSocket) {}

  send(message: import('../core/protocol').ServerMessage): void {
    if (this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(serializeServerMessage(message));
  }

  onMessage(handler: (message: ClientMessage) => void): void {
    this.messageHandler = handler;
    this.ws.on('message', this.handleRawMessage);
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
    this.ws.on('close', () => handler());
    this.ws.on('error', () => handler());
  }

  close(): void {
    this.ws.close();
  }

  private handleRawMessage = (raw: RawData): void => {
    const input = typeof raw === 'string' ? raw : raw.toString();
    const message = parseClientMessage(input);
    if (!message) {
      this.send({ type: 'error', payload: { message: '消息格式错误' } });
      return;
    }

    this.messageHandler?.(message);
  };
}
