declare module 'ws' {
  export type RawData = string | Buffer | ArrayBuffer | Buffer[];

  export default class WebSocket {
    static readonly OPEN: number;
    readonly OPEN: number;
    readyState: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    on(event: 'message', listener: (data: RawData) => void): void;
    on(event: 'close', listener: () => void): void;
    on(event: 'error', listener: (error?: Error) => void): void;
  }

  export class WebSocketServer {
    constructor(options?: { noServer?: boolean });
    on(event: 'connection', listener: (socket: WebSocket, request?: unknown) => void): void;
    emit(event: 'connection', socket: WebSocket, request?: unknown): void;
    handleUpgrade(
      request: unknown,
      socket: unknown,
      head: Buffer,
      callback: (socket: WebSocket) => void,
    ): void;
  }
}
