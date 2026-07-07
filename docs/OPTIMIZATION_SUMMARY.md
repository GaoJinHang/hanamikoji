# 优化总结

## 架构

- 将 UI 安全的卡牌、行动、艺伎数据迁移到 `@hanamikoji/shared`。
- 移除 client 对 `@hanamikoji/engine` 的直接依赖。
- 将 engine reducer 拆分为 validation、effects、roundFlow、playerUtils、cardAccounting 等模块。
- 新增 `RoomStore`，让房间匹配、重连凭证和房间生命周期清理从 Socket 网关中拆出。
- 新增 `playerView`，服务端按玩家发送脱敏状态，避免对手手牌、密约牌和 socketId 泄露。
- Socket.io 服务端泛型保持“接收客户端事件 / 发送服务端事件”的方向。

## 代码质量

- `EngineState.publicState` 改名为 `EngineState.gameState`，明确这是完整权威状态，不能直接广播给客户端。
- 删除 engine reducer 中的调试输出。
- 将最终 pending action 结算后的计分和下一局启动收敛到 engine 内。
- 手牌移除集中在 `reducePlayAction`，`actionEffects` 只负责密约、弃牌堆、艺伎区等状态落点。
- 竞争行动增加严格分组校验：必须恰好包含本次选择的 4 张牌，且不能重复。
- 前端竞争弹窗改为稳定 Hook 结构。
- 游戏结束弹窗修复“你/对手”视角标签。
- SocketProvider 增加带 `reconnectToken` 的恢复流程，支持刷新和 Socket.io 自动重连。
- 服务端新增轻量 payload 校验，避免异常 Socket 请求直接进入业务逻辑。

## 测试

- 修复 `.js + require` 与 `"type": "module"` 冲突，engine 改为 ESM 测试。
- 增加卡牌守恒、不重复卡牌、非法竞争分组等精确测试。
- 增加 replay 确定性测试。
- 增加 Monte Carlo 模拟测试，用 200 局随机游戏持续检查不变量。
- 新增 server 测试：`playerView` 脱敏、`RoomStore` token/TTL、Socket payload 校验。

## 本环境实际验证

```bash
node packages/shared/scripts/build-dual.mjs
node packages/engine/scripts/build-dual.mjs
cd packages/engine && SIM_COUNT=20 node --test test/*.test.js
```

结果：

```text
11 tests passed, 0 failed
```

受容器无法访问 npm registry 且未安装 `react`、`vite`、`express`、`socket.io`、`tsx` 等 workspace 依赖限制，未执行完整 client/server 构建和 server 测试。安装依赖后可运行 `pnpm run check:core && pnpm run build` 做完整验证。
