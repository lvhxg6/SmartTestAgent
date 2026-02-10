#!/bin/bash

# Smart Test Agent 一键启动脚本
# 用法: ./start.sh

set -e

echo "🚀 Smart Test Agent 启动中..."
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ 未找到 Node.js，请先安装 Node.js >= 18${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js 版本过低，需要 >= 18，当前版本: $(node -v)${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

# 检查 pnpm
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}⚠ 未找到 pnpm，正在安装...${NC}"
    npm install -g pnpm
fi
echo -e "${GREEN}✓ pnpm $(pnpm -v)${NC}"

# 检查依赖是否已安装
if [ ! -d "node_modules" ]; then
    echo ""
    echo -e "${YELLOW}📦 安装依赖...${NC}"
    pnpm install
fi

# 检查数据库是否已初始化
DB_FILE="packages/db/prisma/data/smart-test-agent.db"
if [ ! -f "$DB_FILE" ]; then
    echo ""
    echo -e "${YELLOW}🗄️  初始化数据库...${NC}"
    pnpm run db:generate
    pnpm run db:push
    echo -e "${GREEN}✓ 数据库初始化完成${NC}"
else
    echo -e "${GREEN}✓ 数据库已存在${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  启动服务...${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "  后端服务: ${YELLOW}http://localhost:3000${NC}"
echo -e "  前端页面: ${YELLOW}http://localhost:5173${NC}"
echo ""
echo -e "  按 ${RED}Ctrl+C${NC} 停止服务"
echo ""

# 启动开发服务器
pnpm run dev
