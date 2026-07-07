#!/usr/bin/env bash
set -euo pipefail

echo "🎌 Hanamikoji backend source deployment"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Please install Node.js 18+ first."
  exit 1
fi

corepack enable || true
corepack prepare pnpm@latest --activate || true

pnpm install --frozen-lockfile
pnpm run build

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "Created .env from .env.example. Please edit CORS_ORIGIN before production use."
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2 start ecosystem.config.cjs
  pm2 save
else
  echo "PM2 not found. Starting directly with pnpm start."
  pnpm start
fi
