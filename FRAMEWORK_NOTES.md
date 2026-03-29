# Reusable boardgame realtime framework notes

## New server layout

```txt
packages/server/src/
  node/
    server.ts
  worker/
    worker.ts
  core/
    gameServer.ts
    roomManager.ts
    protocol.ts
    types.ts
  socket/
    ISocket.ts
    NodeSocket.ts
    WorkerSocket.ts
  adapters/
    engineAdapter.ts
  index.ts
```

## Responsibility split

- `packages/engine`: only game rules and state reducer.
- `packages/server`: transport, rooms, connection lifecycle, message dispatch.
- `packages/shared`: shared game types and event signatures.

## How to swap to another boardgame later

1. Keep `roomManager`, `ISocket`, `NodeSocket`, `WorkerSocket`, `gameServer`.
2. Replace `packages/engine` with the new game engine.
3. Rewrite only `packages/server/src/adapters/engineAdapter.ts` so it translates generic client messages into the new engine actions and returns framework-level server messages.
4. Reuse the client `createSocketClient()` wrapper so the UI can keep `socket.emit(...)` and `socket.on(...)`.

## Local node run

```bash
cd packages/server
node dist/node/server.js
```

WebSocket endpoint:

```txt
ws://localhost:3001/ws
```

Health endpoint:

```txt
http://localhost:3001/health
```

## Cloudflare Workers dev

```bash
cd packages/server
wrangler dev
```
