---
AIGC:
    ContentProducer: Minimax Agent AI
    ContentPropagator: Minimax Agent AI
    Label: AIGC
    ProduceID: "00000000000000000000000000000000"
    PropagateID: "00000000000000000000000000000000"
    ReservedCode1: 304502210083448106d845d4720eec8a48eb7f2f24467013d2fedf3b1d6d7312e52e8aa5e802201f5aadcc88c06e9165e1b1a0586824540ec892a534d6fc49a75733232d9e0a0a
    ReservedCode2: 30450220406a25e15d6066e7cd4f8745d6b7c5356fb5b8ceee3c1fc75bf93b542e2c6a3b022100bb4f9385b46be9ac780a2fd3175b55710610aa93ee4b2d5071fa08b33c64aead
---

# 花见小路 - 在线对战游戏 MVP

花见小路（Hanamikoji）是一款基于 Web 的双人在线卡牌对战游戏，复刻了经典桌游的核心玩法。本项目是 MVP（最小可行产品）版本，包含完整的游戏逻辑和实时对战功能。

## 游戏规则

### 核心玩法
- 两名玩家通过浏览器实时对战
- 游戏最多进行 3 局
- 每局每位玩家各有 4 次行动机会

### 卡牌系统
- **7 位艺伎**：魅力值从 2 分到 8 分不等
- **21 张物品卡**：属于不同艺伎，用于控制艺伎

### 四种行动
1. **密约**：隐藏 1 张牌，局末翻开计分
2. **取舍**：丢弃 2 张牌，不计入得分
3. **赠予**：选 3 张，对手先选 1 张，剩余归己方
4. **竞争**：选 4 张分成 2 组，对手先选 1 组，剩余归己方

### 胜利条件
- 控制 4 名或更多艺伎
- 累计 11 点或更多魅力值
- 3 局后魅力值更高者获胜

## 技术栈

### 前端
- React 18.2.0
- TypeScript 5.0
- Vite 5.0
- TailwindCSS 3.4
- Socket.io-client 4.7
- Zustand 4.5（状态管理）

### 后端
- Node.js 18+
- Express 4.18
- Socket.io 4.7
- TypeScript 5.0

## 项目结构

```
hanamikoji-mvp/
├── package.json              # 根目录配置
├── tsconfig.json             # TypeScript 配置
├── README.md                 # 项目说明
│
├── packages/
│   ├── shared/               # 前后端共享类型
│   │   ├── src/
│   │   │   ├── index.ts      # 类型导出
│   │   │   ├── types.ts      # 类型定义
│   │   │   └── constants.ts  # 游戏常量
│   │   └── package.json
│   │
│   ├── server/               # 后端服务
│   │   ├── src/
│   │   │   ├── index.ts      # 入口文件
│   │   │   ├── socket/       # Socket.io 处理
│   │   │   │   └── index.ts
│   │   │   └── game/         # 游戏逻辑
│   │   │       ├── GameRoom.ts
│   │   │       ├── CardDeck.ts
│   │   │       ├── actions/  # 四种行动
│   │   │       ├── scoring.ts
│   │   │       └── victory.ts
│   │   └── package.json
│   │
│   └── client/               # 前端应用
│       ├── src/
│       │   ├── main.tsx      # 入口
│       │   ├── App.tsx       # 根组件
│       │   ├── index.css     # 全局样式
│       │   ├── context/      # React Context
│       │   ├── components/   # React 组件
│       │   │   ├── layout/   # 布局组件
│       │   │   ├── geisha/   # 艺伎组件
│       │   │   ├── hand/     # 手牌组件
│       │   │   ├── action/   # 行动组件
│       │   │   └── modal/    # 模态框组件
│       │   └── pages/        # 页面
│       │       ├── Lobby.tsx
│       │       └── Game.tsx
│       ├── index.html
│       ├── vite.config.ts
│       ├── tailwind.config.js
│       └── package.json
```

## 快速开始

### 环境要求
- Node.js 18.17.0 或更高版本
- pnpm（推荐）或 npm

### 安装依赖

```bash
# 根目录安装
pnpm install

# 安装服务端依赖
cd packages/server
pnpm install

# 安装客户端依赖
cd ../client
pnpm install
```

### 启动开发服务器

在项目根目录执行：

```bash
pnpm dev
```

这将同时启动：
- 后端服务器：`http://localhost:3001`
- 前端开发服务器：`http://localhost:5173`

### 测试游戏

1. 打开两个浏览器窗口访问 `http://localhost:5173`
2. 第一个窗口输入名称并点击「开始游戏」
3. 第二个窗口输入名称，会自动加入同一房间
4. 游戏开始后，双方轮流抽牌和执行行动

### 构建生产版本

```bash
pnpm build
```

构建输出：
- 服务端：`packages/server/dist/`
- 客户端：`packages/client/dist/`

## Socket.io 事件

### 客户端发送
| 事件 | 参数 | 说明 |
|------|------|------|
| `joinRoom` | `roomId, playerName, callback` | 加入房间 |
| `startGame` | 无 | 开始游戏 |
| `drawCard` | 无 | 抽牌 |
| `playAction` | `{type, cardIds, grouping}` | 执行行动 |
| `resolveAction` | `selection` | 选择（赠予/竞争） |

### 服务器推送
| 事件 | 参数 | 说明 |
|------|------|------|
| `gameStarted` | `GameState` | 游戏开始 |
| `gameStateUpdate` | `GameState` | 状态更新 |
| `actionRequired` | `type, minCards, maxCards` | 需要行动 |
| `choiceRequired` | `PendingAction` | 需要选择 |
| `gameOver` | `result` | 游戏结束 |
| `error` | `message` | 错误 |

## 开发说明

### 添加新的行动类型
1. 在 `packages/shared/src/types.ts` 中添加 `ActionType`
2. 在 `packages/shared/src/constants.ts` 中添加行动配置
3. 在 `packages/server/src/game/actions/` 中实现执行逻辑
4. 在 `packages/client/src/components/action/ActionPanel.tsx` 中添加按钮

### 修改胜利条件
编辑 `packages/shared/src/constants.ts` 中的 `VICTORY_CONDITIONS`

### 添加新功能
1. 确保前后端类型同步
2. 在服务端实现核心逻辑
3. 前端只负责渲染和用户输入

## 许可证

MIT

## 作者

MiniMax Agent
