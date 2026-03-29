import { handleConnection } from '../core/gameServer';
import { WorkerSocket } from '../socket/WorkerSocket';

interface WorkerRuntimeWebSocket extends WebSocket {
  accept(): void;
}

declare class WebSocketPair {
  0: WorkerRuntimeWebSocket;
  1: WorkerRuntimeWebSocket;
}

type WorkerResponseInit = ResponseInit & { webSocket?: WorkerRuntimeWebSocket };

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', runtime: 'cloudflare-workers' }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    const upgrade = request.headers.get('Upgrade');
    if (upgrade?.toLowerCase() !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();
    handleConnection(new WorkerSocket(server));

    return new Response(null, { status: 101, webSocket: client } as WorkerResponseInit);
  },
};
