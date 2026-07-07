# Hanamikoji 部署与实机测试指南

这份文档面向第一次部署本项目的人，目标是让你能把游戏跑到公网，并用两台真实设备测试：在线服务器模式、离线 P2P relay 模式、纯离线手动 answer 兜底。

> 推荐部署方式：前端放 Cloudflare Pages，后端放一台云服务器，通过 Nginx 反向代理到 Node 服务。

---

## 1. 先看懂这个项目要部署什么

本项目有两个主要玩法入口：

1. **在线服务器模式**  
   两名玩家都连接后端 Socket.io 服务。后端负责房间匹配、连接维护和广播游戏状态。

2. **离线 P2P 模式**  
   两台设备通过 WebRTC DataChannel 直连。后端的 signaling relay 只临时交换连接信息，也就是 Host offer 和 Player answer。  
   relay 不保存手牌、`EngineState`、`eventLog` 或游戏动作。连接成功后，游戏动作直接在两台设备之间传输。

重要边界：

- relay 不等于公网穿透。
- 同一 Wi-Fi / 同一个手机热点是当前优先支持场景。
- 跨运营商网络、公司/校园网、复杂 NAT 等环境可能需要 STUN/TURN。
- 当前纯离线兜底方式是：Host 当前页面粘贴 Player answer。
- 当前没有 Host 摄像头扫码导入 answer。
- 当前断线后需要重新交换 offer/answer；完整扫码恢复不是 MVP 承诺。

---

## 2. 准备工作

你需要准备：

| 项目 | 建议 |
|---|---|
| GitHub 仓库 | 用来放完整源码 |
| Cloudflare Pages | 部署前端页面 |
| 云服务器 | 部署 Node 后端，推荐 1C1G 以上即可起步 |
| 域名 | 推荐两个域名：`www.example.com` 和 `api.example.com` |
| Node.js | 18.17 或更高版本 |
| pnpm | 项目锁定为 pnpm workspace |
| Nginx | 负责 HTTPS 和 WebSocket 反向代理 |

本地或服务器上建议先启用 pnpm：

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
```

如果服务器不能通过 Corepack 下载 pnpm，也可以用 npm 全局安装：

```bash
npm install -g pnpm@9.15.9
```

---

## 3. 本地先跑通

在项目根目录执行：

```bash
pnpm install
pnpm run build
pnpm run check:core
```

本地开发启动：

```bash
pnpm run dev
```

默认情况下：

| 服务 | 地址 |
|---|---|
| 前端 Vite | `http://localhost:5173` |
| 后端 Express + Socket.io | `http://localhost:3001` |

本地前端环境变量可以放在 `packages/client/.env.local`：

```env
VITE_SOCKET_URL=http://localhost:3001
VITE_API_BASE_URL=http://localhost:3001
VITE_P2P_ICE_SERVERS=
```

本地测试建议先打开两个浏览器窗口：

1. 窗口 A 创建在线房间。
2. 窗口 B 输入房间号加入。
3. 能进入游戏后，再继续部署公网。

---

## 4. 部署后端到云服务器

### 4.1 上传源码

把完整源码上传到服务器，例如：

```bash
mkdir -p /www/wwwroot/hanamikoji
cd /www/wwwroot/hanamikoji
```

如果你从 GitHub 拉取：

```bash
git clone https://github.com/your-name/your-repo.git .
```

如果你上传 zip：

```bash
unzip Hanamikoji-GitHub-Source.zip
cd Hanamikoji-GitHub-Source
```

### 4.2 安装依赖并构建

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile
pnpm run build:backend
```

### 4.3 配置后端环境变量

复制示例文件：

```bash
cp .env.example .env
nano .env
```

示例：

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=3001
CORS_ORIGIN=https://your-project.pages.dev,https://www.example.com,https://example.com
```

字段解释：

| 字段 | 怎么填 |
|---|---|
| `HOST` | 建议生产环境用 `127.0.0.1`，只让 Nginx 访问 Node 服务 |
| `PORT` | Node 服务端口，默认 `3001` |
| `CORS_ORIGIN` | 允许访问后端的前端域名，多个域名用英文逗号隔开 |

注意：`CORS_ORIGIN` 必须包含 Cloudflare Pages 的预览域名和正式域名，否则前端可能出现 CORS 或 Socket 连接失败。

### 4.4 用 PM2 启动后端

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

查看日志：

```bash
pm2 logs hanamikoji-server
```

本机健康检查：

```bash
curl http://127.0.0.1:3001/health
curl http://127.0.0.1:3001/api/status
```

能看到 JSON，就说明 Node 后端已启动。

---

## 5. 配置 Nginx 和 HTTPS

推荐使用单独后端域名，例如：

```txt
api.example.com
```

DNS 添加 A 记录：

```txt
类型: A
名称: api
内容: 你的云服务器公网 IP
```

Nginx 配置示例：

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

保存后检查：

```bash
nginx -t
systemctl reload nginx
```

配置 HTTPS，例如使用 Certbot：

```bash
certbot --nginx -d api.example.com
```

公网检查：

```bash
curl https://api.example.com/health
curl https://api.example.com/api/status
```

---

## 6. 部署前端到 Cloudflare Pages

### 6.1 连接 GitHub 仓库

在 Cloudflare Pages 中新建项目，连接你的 GitHub 仓库。

建议构建配置：

```txt
Framework preset: Vite
Build command: pnpm run build:frontend
Build output directory: packages/client/dist
Root directory: /
Node.js version: 20
```

如果你的 Cloudflare Pages 项目只运行 `pnpm run build` 也可以，因为根目录 build 会构建 core、server 和 client；但前端部署只需要 `pnpm run build:frontend`，速度更快。

### 6.2 配置前端环境变量

在 Cloudflare Pages 的环境变量里添加：

```env
VITE_SOCKET_URL=https://api.example.com
VITE_API_BASE_URL=https://api.example.com
VITE_P2P_ICE_SERVERS=
```

说明：

- `VITE_SOCKET_URL`：Socket.io 连接地址。
- `VITE_API_BASE_URL`：REST API 和 signaling relay 地址。
- `VITE_P2P_ICE_SERVERS`：可选，P2P 跨公网时可能需要 STUN/TURN。

只配置 STUN 的例子：

```env
VITE_P2P_ICE_SERVERS=stun:stun1.example.com:3478,stun:stun2.example.com:3478
```

配置 STUN + TURN 的例子：

```env
VITE_P2P_ICE_SERVERS=[{"urls":"stun:stun.example.com:3478"},{"urls":"turn:turn.example.com:3478","username":"user","credential":"pass"}]
```

不要把 TURN 用户名和密码写死进源码，应该放在 Cloudflare Pages 环境变量里。

### 6.3 重新部署前端

保存环境变量后，在 Cloudflare Pages 里重新部署。部署完成后，得到类似：

```txt
https://your-project.pages.dev
```

如果绑定正式域名，推荐：

```txt
https://www.example.com
```

---

## 7. 实机测试清单

建议至少准备两台设备：

- 设备 A：电脑或手机，作为 Host。
- 设备 B：手机，作为 Player。

建议浏览器：Chrome、Edge、Safari 最新版。iPhone 建议使用 Safari 或 Chrome。

### 7.1 在线服务器模式测试

网络要求：两台设备都能访问公网前端和后端。

步骤：

1. 设备 A 打开 `https://www.example.com`。
2. 选择在线模式。
3. 输入昵称，创建房间。
4. 记录房间号。
5. 设备 B 打开同一个前端地址。
6. 选择在线模式，输入昵称和房间号，加入房间。
7. 两边都进入游戏后，轮流出牌测试。
8. 刷新其中一台设备，检查是否能按当前在线模式逻辑恢复或重新加入。

成功标准：

- 两台设备都能连接服务器。
- 房间号可加入。
- 游戏状态能同步。
- 后端日志没有持续报错。

常见问题：

| 现象 | 优先检查 |
|---|---|
| 前端显示服务器连接中 | `VITE_SOCKET_URL` 是否是 HTTPS 后端域名 |
| CORS 报错 | 后端 `.env` 的 `CORS_ORIGIN` 是否包含前端域名 |
| WebSocket failed | Nginx 是否设置 `Upgrade` 和 `Connection` 头 |
| 只能本机访问 | 后端是否只部署在 localhost 且没有 Nginx 反代 |

### 7.2 离线 P2P relay 一次扫码测试

推荐网络：两台设备连接同一个 Wi-Fi，或设备 A 开热点、设备 B 连热点。

步骤：

1. 设备 A 打开前端页面。
2. 选择“离线 P2P 模式”。
3. 选择“创建离线房间（Host）”。
4. 点击“新建离线房间”。
5. 如果 relay 正常，会看到“一次扫码 relay 加入链接 / 二维码”。
6. 设备 B 用相机或扫码工具打开二维码链接。
7. 设备 B 输入昵称，点击“加入并生成 Player answer”。
8. 设备 A 保持在当前 Host 页面，等待自动收到 answer 并建立连接。
9. 两边进入 Ready 房间后开始游戏。

成功标准：

- 设备 B 扫码后可以读取 Host offer。
- 设备 B 能提交 Player answer。
- 设备 A 自动收到 answer，不需要手动粘贴。
- 两边能进入离线 P2P Ready 房间。

注意：

- relay invite 被 Host 读取 answer 后会消费删除；重复打开可能显示过期。
- relay 只交换连接信息，不保存游戏状态。
- relay 不保证跨公网一定连通。

### 7.3 纯离线手动 answer 兜底测试

适用情况：relay 创建失败、二维码太长不好扫、或你想验证无 relay 流程。

步骤：

1. 设备 A 进入“离线 P2P 模式”。
2. 选择 Host，点击“新建离线房间”。
3. 复制“纯离线兜底：长 invite 文本”或让 Player 打开纯离线邀请链接。
4. 设备 B 选择 Player。
5. 粘贴 Host invite，点击“加入并生成 Player answer”。
6. 设备 B 复制生成的 Player answer 文本。
7. 回到设备 A 的**当前 Host 页面**。
8. 把 Player answer 粘贴到“粘贴 Player answer / answer invite”。
9. 点击“导入 answer 并连接”。

成功标准：

- Host 当前页面能导入 Player answer。
- 两台设备进入 P2P Ready 房间。
- 能正常开始离线 P2P 对局。

重要限制：

- 不要关闭或刷新 Host 当前页面，否则原来的 RTCPeerConnection 会丢失。
- 当前版本没有 Host 摄像头扫码导入 Player answer。
- 当前版本不承诺完整双向扫码。

### 7.4 跨网络 P2P 测试

测试目的：确认在不同网络下的连通性边界。

步骤：

1. 设备 A 使用家庭 Wi-Fi。
2. 设备 B 使用手机 4G/5G，或另一个运营商网络。
3. 先用 relay 一次扫码流程测试。
4. 如果连接失败，在 Cloudflare Pages 配置 `VITE_P2P_ICE_SERVERS` 后重新部署前端。
5. 再测试 STUN/TURN 后的连通性。

判断方式：

- 只配置 STUN 后仍失败，并不一定是代码错误，可能是 NAT 类型限制。
- 如果需要稳定跨公网连接，通常需要 TURN。
- TURN 会中转流量，请注意成本、带宽和凭据安全。

### 7.5 断线和刷新测试

在线服务器模式：

1. 创建在线房间并开始游戏。
2. 刷新其中一台设备。
3. 观察是否按在线模式当前重连逻辑恢复。

离线 P2P 模式：

1. 建立 P2P 对局。
2. 刷新 Host 或 Player。
3. 当前 MVP 预期是需要重新交换 offer/answer。
4. 不要把“本机离线恢复信息”理解成 Player 重新扫码一定能恢复。

---

## 8. 上线前最终检查

### 命令检查

```bash
pnpm run build
pnpm run check:core
pnpm -C packages/client test
pnpm -C packages/server test
pnpm -C packages/p2p test
```

### 后端检查

```bash
curl https://api.example.com/health
curl https://api.example.com/api/status
```

### 前端检查

打开浏览器开发者工具：

- Console 没有 CORS 错误。
- Network 中 `/socket.io/` 有成功请求。
- `/api/p2p/invites` 能正常返回。
- 手机扫码打开的是正式前端 HTTPS 地址。

### 安全检查

- `.env` 不要提交到 GitHub。
- TURN 凭据不要写进源码。
- `CORS_ORIGIN` 不要长期使用 `*`。
- 生产环境优先使用 HTTPS。

---

## 9. 常见故障排查

### 前端能打开，但在线模式一直连接中

检查：

1. Cloudflare Pages 环境变量是否配置 `VITE_SOCKET_URL=https://api.example.com`。
2. 后端 `.env` 的 `CORS_ORIGIN` 是否包含前端域名。
3. `https://api.example.com/health` 是否能打开。
4. Nginx 是否正确代理 WebSocket。

### relay 创建失败，自动回退到纯离线邀请

检查：

1. `VITE_API_BASE_URL` 是否是后端 HTTPS 域名。
2. `https://api.example.com/api/status` 是否可访问。
3. 后端日志是否有 rate limit、store full 或 CORS 报错。
4. 前端 Network 中 `/api/p2p/invites` 的响应 JSON。

### Player 已提交 answer，但 Host 没连上

检查：

1. Host 页面是否还停留在创建 invite 的当前页面。
2. 两台设备是否在同一 Wi-Fi / 热点。
3. 浏览器是否允许 WebRTC。
4. 跨公网时是否配置 STUN/TURN。

### 二维码很难扫或不生成

当前策略：

- 1200 字符以内：正常二维码。
- 1200 到 2500 字符：仍生成，但提示可能难扫。
- 超过 2500 字符：不生成单个二维码，请复制文本或优先使用 relay。

---

## 10. 推荐验收记录表

| 测试项 | 设备/网络 | 结果 | 备注 |
|---|---|---|---|
| 在线模式创建房间 | A/B 同 Wi-Fi | 通过 / 不通过 | |
| 在线模式加入房间 | A/B 同 Wi-Fi | 通过 / 不通过 | |
| 在线模式出牌同步 | A/B 同 Wi-Fi | 通过 / 不通过 | |
| P2P relay 一次扫码 | A/B 同 Wi-Fi | 通过 / 不通过 | |
| P2P relay 一次扫码 | A 热点，B 连接热点 | 通过 / 不通过 | |
| 纯离线手动 answer | A/B 同 Wi-Fi | 通过 / 不通过 | |
| 跨运营商 P2P | Wi-Fi + 4G/5G | 通过 / 不通过 | 是否配置 STUN/TURN |
| 断线/刷新行为 | 在线模式 | 通过 / 不通过 | |
| 断线/刷新行为 | 离线 P2P | 符合 MVP 限制 / 不符合 | 预期需重新交换 offer/answer |
