import type { ClientMessage, ServerMessage } from '../core/protocol';

export interface ISocket {
  send(message: ServerMessage): void;
  onMessage(handler: (message: ClientMessage) => void): void;
  onClose(handler: () => void): void;
  close(): void;
}
