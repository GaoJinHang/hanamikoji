/**
 * 花见小路 - Cloudflare Worker 入口
 * 负责健康检查和 WebSocket 请求路由
 */

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
}

export { GameRoom } from "./room";

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {}),
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true, service: "hanamikoji-server", transport: "durable-object" });
    }

    if (url.pathname === "/ws") {
      const upgrade = request.headers.get("Upgrade");
      if (!upgrade || upgrade.toLowerCase() !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }

      const roomId = (url.searchParams.get("roomId") || "ROOM-001").trim().toUpperCase();
      const id = env.GAME_ROOM.idFromName(roomId);
      const stub = env.GAME_ROOM.get(id);
      return stub.fetch(request);
    }

    return json({ ok: true, service: "hanamikoji-server", endpoints: ["/health", "/ws"] });
  },
};
