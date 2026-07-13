/**
 * 花见小路 - 服务端入口文件
 * 初始化 Express 应用和 Socket.io 服务器
 *
 * 推荐生产架构：
 * - 前端：Cloudflare Pages
 * - 后端：云服务器源码部署 + Nginx 反向代理
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { setupSocket } from './socket';
import { ClientToServerEvents, ServerToClientEvents } from '@hanamikoji/shared';
import path from 'path';
import fs from 'fs';

const app = express();
const httpServer = createServer(app);

const LOCAL_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
];

const envOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([...LOCAL_DEV_ORIGINS, ...envOrigins]));

// 获取客户端 dist 目录的绝对路径。后端单独部署时该目录可能不存在，所以后面会做存在性判断。
const clientDistPath = path.resolve(__dirname, '../../client/dist');

// 配置 Socket.io 服务器
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // curl、健康检查、同源请求可能没有 Origin，允许通过。
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked by server: ${origin}`));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// 设置 Socket.io 事件处理
setupSocket(io);

// 中间件：解析 JSON
app.use(express.json());

// 健康检查端点
app.get('/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'hanamikoji-server',
  });
});

// API 端点：获取房间列表（调试用）
app.get('/api/rooms', (_req, res) => {
  res.json({ 
    message: 'Room list API - use socket events for game operations',
    endpoints: {
      health: '/health',
    }
  });
});

// API 端点：获取服务器状态
app.get('/api/status', (_req, res) => {
  res.json({
    status: 'running',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// 如果你把前端也构建到了 server 旁边，可以继续由 Express 托管静态文件；
// 如果使用 Cloudflare Pages 单独部署前端，则这里不会强依赖 client/dist。
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  // 所有其他路由返回 index.html（支持 SPA 路由）
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.json({
      service: 'hanamikoji-server',
      message: 'Backend is running. Frontend is expected to be deployed separately.',
      health: '/health',
      socket: '/socket.io',
    });
  });

  app.use((_req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: 'This backend only serves APIs and Socket.io. Deploy the frontend to Cloudflare Pages.',
    });
  });
}

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';

httpServer.listen(PORT, HOST, () => {
  console.log('==========================================');
  console.log('  花见小路游戏服务器启动成功');
  console.log('==========================================');
  console.log(`  监听地址: http://${HOST}:${PORT}`);
  console.log(`  Socket.io 已就绪: /socket.io`);
  console.log(`  健康检查: /health`);
  console.log(`  允许跨域 Origin: ${allowedOrigins.join(', ') || '(none)'}`);
  console.log('==========================================');
});

export { io, httpServer };
