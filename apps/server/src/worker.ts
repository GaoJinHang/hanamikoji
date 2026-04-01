/**
 * 花见小路 - Cloudflare Worker 入口
 * 负责 WebSocket 请求路由和房间分发
 */

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    // 健康检查端点
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ 
        status: 'ok', 
        service: 'hanamikoji-server', 
        runtime: 'cloudflare-workers' 
      }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    // WebSocket 连接端点
    if (url.pathname === '/ws') {
      const roomId = url.searchParams.get('roomId') || 'default';

      // 使用房间ID创建 Durable Object 实例
      const id = env.GAME_ROOM.idFromName(roomId);
      const stub = env.GAME_ROOM.get(id);

      // 将请求转发给对应的房间实例
      return stub.fetch(request);
    }

    // 房间列表查询端点
    if (url.pathname === '/api/rooms') {
      // 这里可以返回活跃房间信息
      return new Response(JSON.stringify({ 
        rooms: [],
        message: '房间列表功能待实现'
      }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    return new Response('Hanamikoji Server - 请使用 WebSocket 连接', { 
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    });
  },
};