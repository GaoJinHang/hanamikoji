# MVP 优化说明

本次优化围绕三个目标展开：降低耦合、提升代码可维护性、增强测试定位问题的能力。

## 1. 架构优化

### Engine 保持纯逻辑

`@hanamikoji/engine` 继续作为纯游戏逻辑层：输入 `EngineState + EngineAction`，输出新的 `EngineState`。行动处理被拆分为更明确的模块：

- `actionValidation.ts`：校验行动选牌、重复卡牌、竞争分组是否合法。
- `actionEffects.ts`：落地密约、取舍、赠予、竞争的状态变化。
- `roundFlow.ts`：统一处理行动完成后的换人、计分、胜负和自动开新局。
- `cardAccounting.ts`：集中维护卡牌总量和重复卡牌不变量。
- `playerUtils.ts`：集中处理玩家、阶段和回合辅助逻辑。

这样新增行动或调整规则时，不需要继续把逻辑堆进一个巨大的 reducer。

### Client 不再依赖 Engine

前端移除了对 `@hanamikoji/engine` 的依赖。UI 需要展示的卡牌、艺伎、行动配置迁移到 `@hanamikoji/shared`：

- `cards.ts`
- `gameRules.ts`
- `gameData.ts` 作为兼容聚合出口

前端现在只依赖“共享类型和展示安全的规则数据”，不会直接耦合游戏状态机实现。

### Server 分离房间管理、游戏房间和 Socket 网关

- `RoomStore.ts`：负责创建房间、匹配玩家、恢复房间、房间查询。
- `GameRoom.ts`：简化为 engine 状态容器，只负责 dispatch 和广播回调。
- `socket/index.ts`：聚焦传输层事件处理，不再混杂房间查找和核心规则。
- `playerView.ts`：按玩家生成脱敏视图，避免直接把完整 engine state 广播给两个客户端。

`playerView.ts` 会隐藏对手手牌 ID、对手密约牌和对手 socketId，仅保留对手手牌数量。这是在线对战场景的重要安全修复。


### 第二轮补强

- 重连恢复从 `roomId + playerId` 升级为 `roomId + playerId + reconnectToken`，降低房间号泄露后的身份冒充风险。
- `SocketProvider` 在 Socket.io 自动重连后会主动发送 `resumeGame`。
- `RoomStore` 增加等待房、已结束房、双断线房 TTL 清理。
- `socket/validation.ts` 对 join/play/resolve/resume 事件增加运行时 payload 校验。
- `EngineState.publicState` 改名为 `EngineState.gameState`，明确这是完整权威状态，必须由 server 脱敏后才能发送给客户端。
- `actionEffects` 不再重复移除手牌，卡牌从手牌移出的职责集中在 `reducePlayAction`。

## 2. 代码优化

- reducer 从大段嵌套逻辑拆成多个小函数，入口仍保持兼容。
- 新一局流程由 engine 统一处理：最后一个待处理选择结算后，会自动计分并进入下一局或结束游戏。
- `rules/deck.ts` 集中 deterministic shuffle/deal，减少重复发牌逻辑。
- 竞争行动前端弹窗重构，修复了条件 Hook 使用问题。
- 游戏结束弹窗保留在 Game 页面内处理，避免 App 提前卸载页面导致弹窗看不到。
- Socket 事件统一从 `gameStarted/gameStateUpdate` 派发到 App，减少页面间互相调用。
- SocketProvider 在检测到已保存房间号、玩家身份和重连 token 后，会通过 `resumeGame` 尝试恢复正在进行的游戏；自动重连后也会恢复服务器端玩家上下文。

## 3. 测试优化

原测试使用 `.js + require`，但 package 设置了 `"type": "module"`，容易导致测试无法启动。本次改为 ESM 测试文件，可直接使用 Node 内置测试框架运行。

新增/增强覆盖：

- 初始化和发牌确定性测试。
- 抽牌、取舍、赠予、竞争行动的 reducer 测试。
- 重复选牌校验测试。
- 竞争分组必须严格等于本次选择 4 张牌的测试。
- 最终 pending action 结算后自动进入下一局的回归测试。
- replay 确定性测试。
- Monte Carlo 随机模拟，持续检查卡牌总量与重复卡牌不变量。
- server 侧新增 `playerView` 脱敏、`RoomStore` token/TTL、payload validation 测试。

## 4. 验证命令

安装依赖后可运行：

```bash
pnpm install
pnpm test:fast
pnpm test
pnpm run check:core
pnpm build
```

本次在容器中无法重新安装 npm 依赖；我使用现有 TypeScript/Node 环境验证了 shared/engine 构建和 engine 快速测试。

```text
engine tests: 11 passed, 0 failed
```
