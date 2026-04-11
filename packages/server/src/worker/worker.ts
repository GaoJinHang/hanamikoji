// Cloudflare Workers WebSocket 服务器（仅用于开发测试）
// 注意：此文件包含 Cloudflare Workers 特有的 API，只能在 Cloudflare Workers 环境中运行

// 类型声明（仅在 Cloudflare Workers 环境中有效）
declare class WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}

interface WorkerRuntimeWebSocket extends WebSocket {
  accept(): void;
}

type WorkerResponseInit = ResponseInit & { webSocket?: WorkerRuntimeWebSocket };

export default {
  fetch(request: Request) {
    // 检查是否为 WebSocket 升级请求
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    // 创建 WebSocket 对（Cloudflare Workers 特有 API）
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();

    console.log("✅ WS connected");

    // 消息事件处理
    server.addEventListener("message", (event: MessageEvent) => {
      console.log("收到消息:", event.data);

      // 👇 回显，测试用
      server.send(event.data);
    });

    // 关闭事件处理
    server.addEventListener("close", () => {
      console.log("❌ WS closed");
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    } as WorkerResponseInit);
  },
};