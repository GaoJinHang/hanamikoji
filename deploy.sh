#!/bin/bash

# 花见小路 - 部署脚本
# 用法: ./deploy.sh [端口号]

PORT=${1:-3001}

echo "=========================================="
echo "  🎌 花见小路 - 部署脚本"
echo "=========================================="

# 检查 Node.js 版本
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js，请先安装 Node.js"
    exit 1
fi

echo "✅ Node.js 版本: $(node --version)"

# 进入项目目录
cd "$(dirname "$0")"

# 构建前端
echo ""
echo "📦 步骤1/3: 构建前端..."
cd packages/client
if [ ! -d "dist" ]; then
    echo "   安装前端依赖..."
    pnpm install --frozen-lockfile 2>/dev/null || pnpm install
fi
echo "   构建前端..."
pnpm build
if [ ! -d "dist" ]; then
    echo "❌ 错误: 前端构建失败"
    exit 1
fi
echo "✅ 前端构建完成"

# 构建后端
echo ""
echo "📦 步骤2/3: 构建后端..."
cd ../server
if [ ! -d "node_modules" ]; then
    echo "   安装后端依赖..."
    pnpm install --frozen-lockfile 2>/dev/null || pnpm install
fi
echo "   构建后端..."
pnpm build
if [ ! -d "dist" ]; then
    echo "❌ 错误: 后端构建失败"
    exit 1
fi
echo "✅ 后端构建完成"

# 启动服务
echo ""
echo "📦 步骤3/3: 启动服务..."
export PORT=$PORT
echo "   使用端口: $PORT"

# 检查端口是否被占用
if command -v lsof &> /dev/null; then
    if lsof -i :$PORT &> /dev/null; then
        echo "⚠️  端口 $PORT 已被占用，尝试终止..."
        lsof -ti :$PORT | xargs kill -9 2>/dev/null
        sleep 1
    fi
elif command -v netstat &> /dev/null; then
    if netstat -tuln | grep -q ":$PORT "; then
        echo "⚠️  端口 $PORT 已被占用"
        exit 1
    fi
fi

# 启动服务
cd dist
echo "   启动中..."
nohup node index.js > ../server.log 2>&1 &
SERVER_PID=$!

# 等待服务启动
sleep 2

# 检查服务是否运行
if kill -0 $SERVER_PID 2>/dev/null; then
    echo ""
    echo "=========================================="
    echo "  ✅ 部署成功！"
    echo "=========================================="
    echo "  🌐 访问地址: http://localhost:$PORT"
    echo "  🔌 Socket.io: http://localhost:$PORT/socket.io"
    echo "  ❤️  健康检查: http://localhost:$PORT/health"
    echo "=========================================="
else
    echo "❌ 错误: 服务启动失败"
    echo "   请查看日志: packages/server/server.log"
    exit 1
fi
