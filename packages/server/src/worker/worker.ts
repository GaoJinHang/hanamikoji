export default {
  fetch(request: Request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();

    console.log("✅ WS connected");

    server.addEventListener("message", (event) => {
      console.log("收到消息:", event.data);

      // 👇 回显，测试用
      server.send(event.data);
    });

    server.addEventListener("close", () => {
      console.log("❌ WS closed");
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  },
};