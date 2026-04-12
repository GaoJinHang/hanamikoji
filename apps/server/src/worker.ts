/**
 * 花见小路 - Cloudflare Worker 入口
 * 负责健康检查和 WebSocket / Durable Object 路由
 */

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
}

export { GameRoom } from './room';

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({
        status: 'ok',
        service: 'hanamikoji-server',
        runtime: 'cloudflare-workers',
      });
    }

    if (url.pathname === '/api/rooms') {
      return json({
        rooms: [],
        message: 'room listing is not implemented for durable-object rooms yet',
      });
    }

    if (url.pathname === '/ws') {
      const upgrade = request.headers.get('Upgrade');
      if (upgrade?.toLowerCase() !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }

      const roomId = url.searchParams.get('roomId') || 'ROOM-001';
      const id = env.GAME_ROOM.idFromName(roomId);
      const stub = env.GAME_ROOM.get(id);
      return stub.fetch(request);
    }

    return new Response('Hanamikoji Server', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
};
