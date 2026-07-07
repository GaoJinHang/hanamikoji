# 花见小路 Hanamikoji 部署配置说明

## 0. 这次我把项目拆成了什么

你现在有 3 个压缩包：

| 压缩包 | 用途 | 里面包含 | 不包含 |
|---|---|---|---|
| `Hanamikoji-GitHub-Source.zip` | 上传 GitHub 的完整源码仓库 | `client`、`server`、`shared`、`engine`、部署说明、示例配置 | `.git`、`node_modules`、`dist`、`.DS_Store`、`*.tsbuildinfo`、日志、真实 `.env` |
| `Hanamikoji-Cloudflare-Pages-Frontend.zip` | 部署到 Cloudflare Pages 的前端源码包 | `packages/client`、`packages/shared`、`packages/engine`、前端构建所需 root 配置 | `server`、Git 历史、构建产物、缓存 |
| `Hanamikoji-CloudServer-Backend-Source.zip` | 上传到云服务器源码部署的后端包 | `packages/server`、`packages/shared`、`packages/engine`、PM2/Nginx 示例、后端 `.env.example` | `client`、Git 历史、构建产物、缓存 |

> 说明：`shared` 和 `engine` 是共用包，不能简单删掉。前端要用它们做类型和游戏逻辑构建，后端也要用它们跑游戏规则。

---

## 1. 前端 API / Socket 指向怎么配置

你的前端连接后端的位置在：

```txt
packages/client/src/context/socket.ts
```

我已经让它优先读取环境变量：

```txt
VITE_SOCKET_URL
```

也兼容：

```txt
VITE_API_BASE_URL
```

### 本地开发

在 `packages/client/.env.local` 里写：

```env
VITE_SOCKET_URL=http://localhost:3001
VITE_API_BASE_URL=http://localhost:3001
```

然后本地启动：

```bash
pnpm install
pnpm run dev
```

### Cloudflare Pages 生产环境

假设你的后端域名是：

```txt
https://api.example.com
```

在 Cloudflare Pages 项目里添加环境变量：

```env
VITE_SOCKET_URL=https://api.example.com
VITE_API_BASE_URL=https://api.example.com
```

注意：

1. 不要写成 `localhost:3001`。
2. 不要只写 IP，正式环境建议必须用 HTTPS 域名。
3. 不要在末尾加 `/`，例如推荐 `https://api.example.com`，不是 `https://api.example.com/`。


---

## 1.1 离线 P2P / signaling relay 边界

离线 P2P 的 signaling relay 只负责临时交换 WebRTC 连接信息（Host offer / Player answer）。它不保存手牌、`EngineState`、`eventLog` 或任何游戏动作；连接建立后，对局消息通过两台设备之间的 WebRTC DataChannel 传输。

relay signaling 不等于公网穿透。当前 MVP 优先支持两台设备在同一 Wi-Fi 或同一个手机热点下连接；跨运营商网络、公司/校园网、对称 NAT 等场景可能需要额外的 STUN/TURN 服务。

前端可通过 `VITE_P2P_ICE_SERVERS` 配置 ICE servers：

```env
# JSON 写法，支持 STUN + TURN
VITE_P2P_ICE_SERVERS=[{"urls":"stun:stun.example.com:3478"},{"urls":"turn:turn.example.com:3478","username":"user","credential":"pass"}]

# 或逗号分隔写法，适合只配置 STUN
VITE_P2P_ICE_SERVERS=stun:stun1.example.com:3478,stun:stun2.example.com:3478
```

部署注意：

1. 不要把第三方 TURN 用户名、密码硬编码到源码里，应使用 Cloudflare Pages / Vite 环境变量。
2. 当前 MVP 不承诺跨公网必连；relay 只能降低 offer/answer 交换成本，不能代替 TURN。
3. 当前纯离线兜底仍是 Host 当前页面粘贴 Player answer；没有实现 Host 摄像头扫码导入 answer。
4. 当前断线后需要重新交换 offer/answer；完整断线扫码恢复不是当前 MVP 承诺。

---

## 2. Cloudflare Pages 前端部署配置

上传或连接 `Hanamikoji-Cloudflare-Pages-Frontend.zip` 解压后的仓库。

Cloudflare Pages 推荐配置：

```txt
Framework preset: Vite
Build command: pnpm run build
Build output directory: packages/client/dist
Root directory: /
Node.js version: 18 或 20
```

如果 Cloudflare 没有自动识别 pnpm，确认仓库里有：

```txt
pnpm-lock.yaml
pnpm-workspace.yaml
package.json
```

前端包的构建脚本已经按这个顺序处理：

```bash
pnpm -C packages/shared build
pnpm -C packages/engine build
pnpm -C packages/client build
```

---

## 3. 云服务器后端源码部署

把 `Hanamikoji-CloudServer-Backend-Source.zip` 上传到云服务器，例如：

```bash
mkdir -p /www/wwwroot/hanamikoji-server
cd /www/wwwroot/hanamikoji-server
unzip Hanamikoji-CloudServer-Backend-Source.zip
```

安装依赖并构建：

```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm install --frozen-lockfile
pnpm run build
```

创建后端环境变量文件：

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

| 字段 | 作用 |
|---|---|
| `HOST=127.0.0.1` | 只让 Node 服务监听服务器本机，外网通过 Nginx 访问，更安全 |
| `PORT=3001` | 后端 Node 服务端口 |
| `CORS_ORIGIN` | 允许访问后端 Socket/API 的前端域名，多个域名用英文逗号隔开 |

### 用 PM2 启动

安装 PM2：

```bash
npm install -g pm2
```

启动：

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

查看日志：

```bash
pm2 logs hanamikoji-server
```

健康检查：

```bash
curl http://127.0.0.1:3001/health
```

---

## 4. 端口 + Nginx 反向代理怎么配

建议结构：

```txt
用户浏览器
  -> https://www.example.com        Cloudflare Pages 前端
  -> https://api.example.com        Nginx
       -> http://127.0.0.1:3001    Node/Socket.io 后端
```

后端 Node 只监听：

```env
HOST=127.0.0.1
PORT=3001
```

Nginx 监听公网 80/443，再反代到本机 3001。

### Nginx 配置示例

文件可以放到：

```txt
/etc/nginx/conf.d/hanamikoji-api.conf
```

内容：

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

配置 HTTPS，例如使用 Certbot：

```bash
certbot --nginx -d api.example.com
```

---

## 5. 域名怎么配

推荐至少两个域名：

```txt
www.example.com      前端，指向 Cloudflare Pages
api.example.com      后端，指向云服务器
```

### 前端域名

在 Cloudflare Pages 里绑定自定义域名：

```txt
www.example.com
```

通常会生成或要求你配置 CNAME 到 Pages 项目域名。

### 后端域名

DNS 添加：

```txt
类型: A
名称: api
内容: 你的云服务器公网 IP
代理状态: 可开启 Cloudflare 代理，也可以先 DNS only 排错
```

如果开启 Cloudflare 代理，WebSocket 也可以正常走 Cloudflare；但首次排错时，建议先用 DNS only 确认 Nginx + Node 正常，再开启代理。

部署后，Cloudflare Pages 的环境变量必须改成：

```env
VITE_SOCKET_URL=https://api.example.com
VITE_API_BASE_URL=https://api.example.com
```

然后重新部署前端。

---

## 6. 上线后怎么测试

### 后端

```bash
curl https://api.example.com/health
curl https://api.example.com/api/status
```

能返回 JSON 就说明 Nginx 到 Node 反代正常。

### 前端

浏览器打开：

```txt
https://www.example.com
```

打开开发者工具 Console，应该看到类似：

```txt
初始化 Socket 连接: https://api.example.com
Socket 连接成功
```

如果报 CORS，检查云服务器 `.env` 的 `CORS_ORIGIN` 是否包含你的 Cloudflare Pages 域名和正式前端域名。

如果报 WebSocket 连接失败，优先检查 Nginx 是否有：

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;
```

---

## 7. 怎么让后续项目更清楚地区分前端和后端

推荐你以后固定使用这种目录：

```txt
project-root/
  apps/
    web/              # 前端：React/Vite/Next
    api/              # 后端：Express/Nest/Koa
  packages/
    shared/           # 前后端共用类型、常量
    engine/           # 游戏核心逻辑，尽量不依赖浏览器/Node 特有 API
  docs/
    deploy.md
  .env.example
  package.json
  pnpm-workspace.yaml
```

你现在的项目是：

```txt
packages/
  client/
  server/
  shared/
  engine/
```

这个结构已经比较清楚，属于 monorepo 的合理结构。它的优点是：

1. 前端在 `client`。
2. 后端在 `server`。
3. 类型、常量在 `shared`。
4. 游戏核心逻辑在 `engine`，可以前后端复用。

但还有 3 个地方可以继续优化：

### 优化 1：把部署文档放进 `docs/`

建议：

```txt
docs/
  deploy-cloudflare-pages.md
  deploy-server.md
  domain-and-nginx.md
```

### 优化 2：环境变量示例分开放

建议：

```txt
packages/client/.env.example
packages/server/.env.example
```

前端只放 `VITE_` 变量；后端放 `PORT`、`HOST`、`CORS_ORIGIN`。

### 优化 3：避免前端包直接依赖后端，后端包也不要依赖前端

你的后端原来代码里有一段可以托管 `client/dist`，这适合同机部署，但不适合 Cloudflare Pages + 云服务器分离部署。我已经把它改成“如果存在 client/dist 才托管，不存在也能正常作为纯后端启动”。

---

## 8. 我这次剔除了哪些不要的文件

这些不会进入部署包：

```txt
.git/
node_modules/
dist/
build/
coverage/
.cache/
.pnpm-store/
.DS_Store
Thumbs.db
*.tsbuildinfo
*.log
package-lock.json
packages/*/pnpm-lock.yaml
真实 .env 文件
```

保留 root `pnpm-lock.yaml`，因为这是 pnpm workspace 安装依赖最需要的锁文件。
