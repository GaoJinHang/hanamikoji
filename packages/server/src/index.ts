/**
 * 花见小路 - 服务端入口文件
 * 初始化 Express 应用和 Socket.io 服务器
 * 支持同时提供前端静态文件和后端 API
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { setupSocket } from './socket';
import { ServerToClientEvents, ClientToServerEvents } from '@hanamikoji/shared';
import path from 'path';

const app = express();
const httpServer = createServer(app);

// 获取客户端 dist 目录的绝对路径
const clientDistPath = path.resolve(__dirname, '../../client/dist');

// 配置 Socket.io 服务器
const io = new Server<ServerToClientEvents, ClientToServerEvents>(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
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

// 提供前端静态文件
app.use(express.static(clientDistPath));

// 所有其他路由返回 index.html（支持 SPA 路由）
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log('==========================================');
  console.log('  🎌 花见小路游戏服务器启动成功');
  console.log('==========================================');
  console.log(`  📡 服务器地址: http://localhost:${PORT}`);
  console.log(`  🎮 前端页面: http://localhost:${PORT}`);
  console.log(`  🔌 Socket.io 已就绪`);
  console.log(`  ❤️  健康检查: http://localhost:${PORT}/health`);
  console.log('==========================================');
});

export { io, httpServer };
