# 第二轮优化记录

本轮优化基于外部评审意见，优先处理 MVP 上线前风险最高的稳定性、安全性和可测试性问题。

## 对评审的判断

评分：8.5 / 10。

评审判断整体准确：当前四层架构方向正确，engine 拆分和脱敏发送应保留；同时，重连安全、Socket 自动恢复、房间生命周期、服务端运行时校验和 server/playerView 测试确实是下一批最值得补的内容。

我不同意或需要修正的点：

- `publicState` 不是已经实际泄露的 bug，因为 server 发送前已经经过 `createPlayerView()`；但命名确实容易误导，所以已改名为 `gameState`，并在注释中明确这是完整权威状态，不能直接广播给客户端。
- 运行时校验不一定需要立刻引入 Zod。MVP 阶段用轻量手写校验能避免新增依赖，同时覆盖恶意/异常 Socket payload 的主要风险。
- `RoomStore` 原本会删除空等待房，不是完全没有清理；真正缺口是已开始、已结束、长期断线房间没有 TTL。

## 已落地改动

### 1. 重连安全

- `RoomStore` 为每个玩家生成 64 位十六进制 `reconnectToken`。
- `gameStarted` 会把当前玩家自己的 token 发给对应客户端。
- `resumeGame(roomId, playerId, reconnectToken)` 必须通过 token 校验后才会绑定新 socket。
- `playerJoined` 只发送公开玩家信息，不会泄露对手 token。

### 2. Socket 自动重连恢复

- `SocketProvider` 在 `connect` 事件里读取本地 `roomId / playerId / reconnectToken`。
- Socket.io 自动重连或刷新后，会主动发送 `resumeGame`。

### 3. 房间生命周期清理

`RoomStore` 增加 TTL 清理：

- 等待房间 TTL：默认 30 分钟。
- 已结束房间 TTL：默认 30 分钟。
- 双方都断线的进行中房间 TTL：默认 2 小时。
- Socket 网关每分钟触发一次清理。

### 4. 服务端运行时校验

新增 `packages/server/src/socket/validation.ts`，对关键事件做轻量校验：

- `joinRoom`：房间号、玩家名长度。
- `playAction`：行动类型、卡牌数组、重复卡牌、竞争分组。
- `resolveAction`：选择值必须是 0-2 的整数。
- `resumeGame`：房间号、玩家 ID、重连 token 格式。

### 5. 命名和职责边界

- `EngineState.publicState` 改名为 `EngineState.gameState`。
- 注释明确：这是完整权威状态，server 必须通过 `createPlayerView()` 脱敏后才能发给客户端。
- `actionEffects` 不再重复移除手牌；手牌移除集中在 `reducePlayAction`，避免职责重复。

### 6. 测试增强

新增 server 侧测试文件：

- `packages/server/test/playerView.test.ts`
- `packages/server/test/RoomStore.test.ts`
- `packages/server/test/validation.test.ts`

覆盖：

- 对手手牌、密约牌、socketId 脱敏。
- `RoomStore` token 恢复校验。
- 等待房、结束房、断线房 TTL 清理。
- Socket payload 基础运行时校验。

## 验证情况

当前容器没有安装完整 workspace 依赖，因此无法执行 server/client 构建和 server tsx 测试。已执行并通过：

```bash
node packages/shared/scripts/build-dual.mjs
node packages/engine/scripts/build-dual.mjs
cd packages/engine && SIM_COUNT=20 node --test test/*.test.js
```

结果：

```text
11 tests passed, 0 failed
```

本地完整依赖安装后建议执行：

```bash
pnpm install --frozen-lockfile
pnpm run check:core
pnpm run build
```
