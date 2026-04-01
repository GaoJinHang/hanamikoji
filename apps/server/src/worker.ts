/**
 * 花见小路 - Cloudflare Worker 入口
 * 负责 WebSocket 请求路由和房间分发
 */

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
}

export { GameRoom } from "./room";

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const roomId = url.searchParams.get("roomId") || "default";

      const id = env.GAME_ROOM.idFromName(roomId);
      const stub = env.GAME_ROOM.get(id);

      return stub.fetch(request);
    }

    return new Response("OK");
  },
};