# Hanamikoji MVP 架构说明

这个版本保留原 MVP 的 Monorepo 形态，但把代码边界调整为更稳定的四层：

## 1. shared：稳定契约和 UI 安全数据

`packages/shared` 只放前后端都可以安全依赖的内容：

- Socket 事件接口。
- 公共游戏状态类型。
- 卡牌、行动、艺伎等静态展示数据。
- 基础游戏常量。

前端现在从 `@hanamikoji/shared` 读取卡牌和行动配置，不再从 `@hanamikoji/engine` 读取 reducer 内部实现。

## 2. engine：纯游戏状态机

`packages/engine` 是确定性的游戏核心。它接收 `EngineState + EngineAction`，返回新的 `EngineState`，不依赖 Socket、Express 或房间管理。

关键模块：

- `game/reducer.ts`：状态机入口，按 action 分发。
- `game/actionValidation.ts`：校验选牌数量、重复卡牌、竞争分组。
- `game/actionEffects.ts`：执行密约、取舍、赠予、竞争的状态变化。
- `game/roundFlow.ts`：统一处理换人、计分、胜负和自动进入下一局。
- `game/cardAccounting.ts`：卡牌总量、重复卡牌等不变量检查。
- `rules/deck.ts`：确定性洗牌和发牌。

这样新增规则时，优先新增/修改小模块，而不是继续扩展一个巨大的 reducer。

## 3. server：房间编排和传输层

`packages/server` 负责在线对战的编排，不直接实现游戏规则：

- `game/RoomStore.ts`：房间创建、匹配、重连 token 校验、等待/结束/断线房 TTL 清理。
- `game/GameRoom.ts`：engine state 容器，负责 dispatch 和广播。
- `game/playerView.ts`：按玩家生成脱敏视图，避免泄露对手手牌。
- `socket/index.ts`：Socket.io 网关，只处理客户端事件、身份和通知。

重要安全点：server 不再直接广播完整 engine `gameState`。发送给每个玩家前，会通过 `createPlayerView()` 隐藏对手手牌 ID、对手密约牌和对手 socketId，只保留对手手牌数量。恢复房间时必须提供服务端签发的 `reconnectToken`。

## 4. client：UI 和 Socket 状态

`packages/client` 只依赖 `@hanamikoji/shared` 和 Socket 事件：

- `SocketContext` 统一接收 `gameStarted/gameStateUpdate`，再派发给 App。
- `Lobby` 只处理加入和等待；`SocketProvider` 会在刷新或 Socket.io 自动重连后根据本地 token 主动恢复。
- `Game` 只根据服务端状态渲染 UI，不直接调用 engine。
- `CompetitionModal` 不再在条件分支中调用 Hook，避免 React Hook 顺序问题。

## 常用命令

安装依赖后：

```bash
pnpm install
pnpm run check:core
pnpm run build
```

`check:core` 会构建 shared、运行 engine 测试，并运行 server 测试。
