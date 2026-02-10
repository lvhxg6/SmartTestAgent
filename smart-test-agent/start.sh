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

# 检查端口是否被占用
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # 端口被占用
    else
        return 1  # 端口空闲
    fi
}

# 检查服务是否已运行
SERVER_PORT=3000
WEB_PORT=5173

if check_port $SERVER_PORT || check_port $WEB_PORT; then
    echo -e "${YELLOW}⚠ 检测到服务可能已在运行：${NC}"
    
    if check_port $SERVER_PORT; then
        PID=$(lsof -Pi :$SERVER_PORT -sTCP:LISTEN -t 2>/dev/null | head -1)
        echo -e "  - 后端服务 (端口 $SERVER_PORT) 已被占用 ${RED}[PID: $PID]${NC}"
    fi
    
    if check_port $WEB_PORT; then
        PID=$(lsof -Pi :$WEB_PORT -sTCP:LISTEN -t 2>/dev/null | head -1)
        echo -e "  - 前端服务 (端口 $WEB_PORT) 已被占用 ${RED}[PID: $PID]${NC}"
    fi
    
    echo ""
    echo -e "请选择操作："
    echo -e "  ${GREEN}1${NC}) 停止已有服务并重新启动"
    echo -e "  ${GREEN}2${NC}) 直接打开浏览器访问"
    echo -e "  ${GREEN}3${NC}) 退出"
    echo ""
    read -p "请输入选项 [1/2/3]: " choice
    
    case $choice in
        1)
            echo ""
            echo -e "${YELLOW}正在停止已有服务...${NC}"
            if check_port $SERVER_PORT; then
                lsof -Pi :$SERVER_PORT -sTCP:LISTEN -t 2>/dev/null | xargs kill -9 2>/dev/null || true
            fi
            if check_port $WEB_PORT; then
                lsof -Pi :$WEB_PORT -sTCP:LISTEN -t 2>/dev/null | xargs kill -9 2>/dev/null || true
            fi
            sleep 1
            echo -e "${GREEN}✓ 已停止${NC}"
            ;;
        2)
            echo ""
            echo -e "${GREEN}正在打开浏览器...${NC}"
            if command -v open &> /dev/null; then
                open "http://localhost:$WEB_PORT"
            elif command -v xdg-open &> /dev/null; then
                xdg-open "http://localhost:$WEB_PORT"
            else
                echo -e "请手动访问: ${YELLOW}http://localhost:$WEB_PORT${NC}"
            fi
            exit 0
            ;;
        3|*)
            echo "退出"
            exit 0
            ;;
    esac
fi

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
echo -e "  后端服务: ${YELLOW}http://localhost:$SERVER_PORT${NC}"
echo -e "  前端页面: ${YELLOW}http://localhost:$WEB_PORT${NC}"
echo ""
echo -e "  按 ${RED}Ctrl+C${NC} 停止服务"
echo ""

# 启动开发服务器
pnpm run dev
