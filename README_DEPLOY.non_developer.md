# Hanamikoji 部署说明（非专业开发者版）

这份 README 说明如何理解、部署和使用这个项目。它尽量少讲术语，按“你要做什么”来写。

如果你只想按步骤部署和拿真机测试，请优先看：

- [部署与实机测试指南](docs/DEPLOY_AND_DEVICE_TESTING.md)

---

## 1. 这个项目是什么

Hanamikoji 是一个双人卡牌策略游戏项目，当前包含两种玩法：

1. **在线服务器模式**  
   两名玩家都连接你的后端服务器，通过房间号一起游戏。

2. **离线 P2P 模式**  
   两台设备尽量直接连接。后端 relay 只帮忙交换 WebRTC 连接信息，不参与游戏过程。

当前推荐部署方式：

```txt
玩家浏览器
  -> https://www.example.com        前端页面，部署在 Cloudflare Pages
  -> https://api.example.com        后端 API / Socket / relay，部署在云服务器
       -> http://127.0.0.1:3001    Node 服务
```

---

## 2. 目录怎么看

你会看到这些主要目录：

```txt
packages/
  client/     前端页面，React + Vite
  server/     后端服务，Express + Socket.io + signaling relay
  shared/     前后端共用类型、常量和基础数据
  engine/     游戏规则核心逻辑
  p2p/        离线 P2P 协议、邀请编码、运行时

docs/         项目文档
deploy/       Nginx 等部署示例
```

重要提醒：

- 不要随意删除 `shared`、`engine`、`p2p`。前端和后端都依赖它们。
- `engine` 是游戏规则核心，部署和 UI 调整通常不需要改它。
- `client` 是网页界面。
- `server` 是在线房间、Socket 和 P2P relay。

---

## 3. 需要准备什么

| 你需要的东西 | 用途 |
|---|---|
| GitHub 仓库 | 存放源码，方便 Cloudflare Pages 自动部署 |
| Cloudflare Pages | 部署前端网页 |
| 云服务器 | 部署后端 Node 服务 |
| 域名 | 推荐 `www.example.com` 和 `api.example.com` |
| Node.js 18.17+ | 运行和构建项目 |
| pnpm | 安装依赖、运行构建和测试 |
| Nginx | 给后端配置 HTTPS 和 WebSocket 反向代理 |

项目指定包管理器：

```txt
pnpm@9.15.9
```

安装或启用 pnpm：

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
```

如果 Corepack 下载失败，可以改用：

```bash
npm install -g pnpm@9.15.9
```

---

## 4. 先在本地确认项目能跑

在项目根目录执行：

```bash
pnpm install
pnpm run build
pnpm run check:core
```

本地启动前后端：

```bash
pnpm run dev
```

本地地址通常是：

| 服务 | 地址 |
|---|---|
| 前端 | `http://localhost:5173` |
| 后端 | `http://localhost:3001` |

本地前端环境变量可以新建：

```txt
packages/client/.env.local
```

内容：

```env
VITE_SOCKET_URL=http://localhost:3001
VITE_API_BASE_URL=http://localhost:3001
VITE_P2P_ICE_SERVERS=
```

---

## 5. 后端部署到云服务器

### 5.1 上传或拉取源码

```bash
mkdir -p /www/wwwroot/hanamikoji
cd /www/wwwroot/hanamikoji
git clone https://github.com/your-name/your-repo.git .
```

如果你是上传 zip，就解压后进入项目目录。

### 5.2 安装依赖并构建后端

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile
pnpm run build:backend
```

### 5.3 配置后端 `.env`

复制示例：

```bash
cp .env.example .env
nano .env
```

推荐内容：

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=3001
CORS_ORIGIN=https://your-project.pages.dev,https://www.example.com,https://example.com
```

怎么理解这些配置：

| 配置 | 说明 |
|---|---|
| `HOST=127.0.0.1` | Node 只监听服务器本机，更安全；公网访问交给 Nginx |
| `PORT=3001` | 后端服务端口 |
| `CORS_ORIGIN` | 哪些前端域名允许访问后端，多个域名用英文逗号分隔 |

### 5.4 用 PM2 运行后端

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

检查：

```bash
pm2 logs hanamikoji-server
curl http://127.0.0.1:3001/health
```

---

## 6. Nginx 和后端域名

推荐后端域名：

```txt
api.example.com
```

Nginx 示例已经放在：

```txt
deploy/nginx-hanamikoji-api.conf
```

核心配置如下：

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

检查并重载：

```bash
nginx -t
systemctl reload nginx
```

配置 HTTPS 后，检查：

```bash
curl https://api.example.com/health
curl https://api.example.com/api/status
```

能返回 JSON，说明后端公网访问基本正常。

---

## 7. 前端部署到 Cloudflare Pages

在 Cloudflare Pages 新建项目，连接你的 GitHub 仓库。

推荐构建配置：

```txt
Framework preset: Vite
Build command: pnpm run build:frontend
Build output directory: packages/client/dist
Root directory: /
Node.js version: 20
```

然后在 Cloudflare Pages 环境变量中添加：

```env
VITE_SOCKET_URL=https://api.example.com
VITE_API_BASE_URL=https://api.example.com
VITE_P2P_ICE_SERVERS=
```

说明：

| 变量 | 用途 |
|---|---|
| `VITE_SOCKET_URL` | 在线模式 Socket.io 后端地址 |
| `VITE_API_BASE_URL` | REST API 和 P2P relay 地址 |
| `VITE_P2P_ICE_SERVERS` | 可选，配置 STUN/TURN，提高跨网络 P2P 成功率 |

注意：

- 不要写 `localhost`。
- 生产环境推荐 HTTPS 域名。
- 地址末尾不要加 `/`，推荐 `https://api.example.com`。
- 改完环境变量后要重新部署前端。

---

## 8. 离线 P2P / relay 的真实边界

这是很多人最容易误解的地方。

### relay 做什么

relay 只临时交换连接信息：

```txt
Host offer -> relay -> Player
Player answer -> relay -> Host
```

relay 不保存：

- 手牌
- `EngineState`
- `eventLog`
- 游戏动作
- 对局历史

连接建立后，游戏数据通过 WebRTC DataChannel 在两台设备之间传输。

### relay 不做什么

relay 不等于公网穿透。它只能让两台设备更方便地交换 offer/answer，不能保证任何网络都能直连。

当前优先支持：

- 两台设备在同一 Wi-Fi。
- 一台设备开手机热点，另一台设备连接这个热点。

可能需要 STUN/TURN 的场景：

- 两台设备不在同一网络。
- 跨运营商网络。
- 公司网、校园网、酒店网。
- 对称 NAT 或严格防火墙。

### ICE servers 配置

只配置 STUN 的例子：

```env
VITE_P2P_ICE_SERVERS=stun:stun1.example.com:3478,stun:stun2.example.com:3478
```

配置 STUN + TURN 的例子：

```env
VITE_P2P_ICE_SERVERS=[{"urls":"stun:stun.example.com:3478"},{"urls":"turn:turn.example.com:3478","username":"user","credential":"pass"}]
```

不要把 TURN 凭据硬编码到源码里，请配置到部署平台环境变量。

### 当前 MVP 不承诺的能力

当前版本不承诺：

- 公网一定能 P2P 连通。
- 完整断线扫码恢复。
- Host 摄像头扫码导入 Player answer。
- 完整双向扫码兜底。

纯离线兜底仍然是：Player 生成 answer 后，复制回 Host 当前页面粘贴。

---

## 9. 真机测试怎么做

完整步骤见：

- [部署与实机测试指南](docs/DEPLOY_AND_DEVICE_TESTING.md)

最少要测这几项：

| 测试项 | 推荐网络 | 目标 |
|---|---|---|
| 在线模式创建/加入房间 | 两台设备都能访问公网 | 确认服务器模式正常 |
| 在线模式出牌同步 | 任意公网 | 确认 Socket 通信正常 |
| P2P relay 一次扫码 | 同一 Wi-Fi / 手机热点 | 确认 relay 和 WebRTC 基本可用 |
| 纯离线手动 answer | 同一 Wi-Fi / 手机热点 | 确认无 relay 兜底可用 |
| 跨网络 P2P | Wi-Fi + 4G/5G | 确认是否需要 STUN/TURN |
| 刷新/断线 | 在线和离线分别测 | 确认当前 MVP 边界 |

---

## 10. 上线前命令检查

每次正式部署前建议运行：

```bash
pnpm run build
pnpm run check:core
pnpm -C packages/client test
pnpm -C packages/server test
pnpm -C packages/p2p test
```

如果只是改文案或文档，也至少建议运行：

```bash
pnpm run build
```

---

## 11. 常见问题

### 前端打开后一直显示服务器连接中

检查：

1. Cloudflare Pages 是否配置 `VITE_SOCKET_URL=https://api.example.com`。
2. 后端 `.env` 的 `CORS_ORIGIN` 是否包含前端域名。
3. `https://api.example.com/health` 是否能访问。
4. Nginx 是否支持 WebSocket Upgrade。

### CORS 报错

通常是后端 `.env` 的 `CORS_ORIGIN` 没包含当前前端域名。把 Cloudflare Pages 默认域名和你的正式域名都加进去，例如：

```env
CORS_ORIGIN=https://your-project.pages.dev,https://www.example.com,https://example.com
```

然后重启后端：

```bash
pm2 restart hanamikoji-server
```

### P2P relay 能扫码，但连不上

优先确认：

1. 两台设备是否在同一 Wi-Fi / 热点。
2. Host 页面是否保持打开，没有刷新。
3. 浏览器是否支持 WebRTC。
4. 跨公网时是否配置 STUN/TURN。

这不一定是 relay 失败；relay 只交换 offer/answer，不保证 NAT 穿透。

### 二维码过长或不显示

当前二维码策略：

| 长度 | 行为 |
|---|---|
| `<= 1200` | 正常生成二维码 |
| `1201 - 2500` | 生成二维码，但提示可能难扫 |
| `> 2500` | 不生成单个二维码，保留复制文本 |

优先使用 relay 一次扫码，或者复制文本。

---

## 12. 简单维护建议

- 文档和 `.env.example` 保持同步。
- 部署前不要提交真实 `.env`。
- 不要在前端源码里写死 TURN 密码。
- 后端上线后要定期看 PM2 日志。
- 如果将来要支持稳定跨公网 P2P，优先规划 TURN 服务。
- 如果将来要支持完整断线恢复，需要单独设计状态恢复协议，不建议在当前 MVP 上临时硬塞。
