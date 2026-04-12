/**
 * 花见小路 - Cloudflare Worker 入口
 * 负责 WebSocket 请求路由和房间分发
 */

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
}

export { GameRoom } from './room';

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }

      const roomId = url.searchParams.get('roomId') || 'ROOM-001';
      const id = env.GAME_ROOM.idFromName(roomId);
      const stub = env.GAME_ROOM.get(id);

      return stub.fetch(request);
    }

    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'hanamikoji-server' });
    }

    return new Response('OK');
  },
};
