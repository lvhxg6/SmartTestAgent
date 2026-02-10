# Smart Test Agent

PRD-Based UI Testing Agent System - AI-powered automated testing from PRD to Markdown reports.

## Overview

Smart Test Agent 是一个 AI 驱动的自动化测试系统，实现从 PRD → 测试用例生成 → Playwright UI 自动化执行（读写操作）→ AI 交叉审核 → 源码定位与根因分析 → Markdown 缺陷报告的完整闭环。

## Architecture

```
smart-test-agent/
├── apps/
│   ├── web/                    # React + Ant Design 前端 (端口 5173)
│   └── server/                 # Express + tRPC 后端 (端口 3000)
├── packages/
│   ├── core/                   # 核心业务逻辑
│   │   ├── orchestrator/       # 状态机编排引擎
│   │   ├── source-indexer/     # 源码索引器
│   │   ├── cli-adapter/        # Claude Code / Codex CLI 适配器
│   │   ├── quality-gate/       # 质量门禁计算器
│   │   ├── report-generator/   # Markdown 报告生成器
│   │   ├── cross-validator/    # 交叉验证裁决器
│   │   ├── workspace/          # 工作空间管理
│   │   ├── pipeline/           # 端到端流程编排
│   │   └── target-profile/     # 目标配置管理
│   ├── playwright-runner/      # Playwright 执行器
│   ├── shared/                 # 共享类型和工具
│   │   ├── types/              # TypeScript 类型定义
│   │   ├── schemas/            # JSON Schema 定义
│   │   └── utils/              # 通用工具函数
│   └── db/                     # Prisma 数据库层
├── prompts/                    # AI Prompt 模板
│   ├── prd-parse.md            # PRD 解析提示词
│   ├── ui-test-execute.md      # 测试执行提示词
│   └── review-results.md       # 结果审核提示词
├── data/                       # SQLite 数据库文件目录
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js 18+
- **Package Manager**: pnpm 9+
- **Monorepo**: Turborepo
- **Frontend**: React 18 + Ant Design 5 + Vite
- **Backend**: Express + tRPC + Socket.IO
- **Database**: SQLite + Prisma
- **Testing**: Playwright + Vitest + fast-check (属性测试)
- **AI Integration**: Claude Code CLI + Codex CLI

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 9.0.0

### Installation

```bash
# 安装依赖
pnpm install
```

### Database Setup (首次运行需要)

```bash
# 生成 Prisma Client (将 schema 定义转换为 TypeScript 客户端代码)
pnpm run db:generate

# 创建数据库表结构 (在 SQLite 中创建表)
pnpm run db:push
```

**说明：**
- `db:generate` - 读取 `schema.prisma`，生成类型安全的数据库客户端到 `node_modules/@prisma/client`
- `db:push` - 将 schema 定义同步到实际的 SQLite 数据库文件
- 这两个命令只需在首次运行或修改 schema 后执行

**数据库文件位置：**
```
smart-test-agent/packages/db/prisma/data/smart-test-agent.db
```

### Start Development Server

**方式一：使用 Turbo 同时启动前后端（推荐）**

```bash
pnpm run dev
```

**方式二：分别启动**

```bash
# 终端 1 - 启动后端服务 (端口 3000)
cd apps/server
pnpm run dev

# 终端 2 - 启动前端 (端口 5173)
cd apps/web
pnpm run dev
```

### Access Application

打开浏览器访问: http://localhost:5173

## Available Scripts

```bash
# 开发模式
pnpm run dev          # 启动所有应用

# 构建
pnpm run build        # 构建所有包

# 测试
pnpm run test         # 运行所有测试 (815+ 测试用例)
pnpm run typecheck    # TypeScript 类型检查

# 数据库
pnpm run db:generate  # 生成 Prisma Client
pnpm run db:push      # 同步数据库结构
pnpm run db:migrate   # 运行数据库迁移

# 代码格式化
pnpm run format       # 格式化代码
pnpm run lint         # 代码检查
```

## Core Features

1. **源码辅助生成**: 解析前端源码（路由表、页面组件、API 定义）提升 Playwright 选择器准确率
2. **JS 脚本直接执行**: 生成完整的 Playwright JS 测试脚本，通过 `node` 命令执行
3. **交叉审核机制**: Claude Code 执行 + Codex 审核，双重验证
4. **状态机驱动**: 8 态状态机管理测试流程，支持幂等性和异常恢复
5. **质量门禁**: RC/APR/FR 三重指标保障测试质量
6. **Markdown 报告**: 输出易读、可分享的 Markdown 格式报告

## Environment Variables

复制 `.env.example` 为 `.env` 并配置：

```bash
# 数据库配置 (SQLite)
DATABASE_URL="file:./data/smart-test-agent.db"

# 测试凭证 (用于 UI 测试)
TEST_USERNAME="admin"
TEST_PASSWORD="admin123"
```

## Test Coverage

项目包含 815+ 测试用例：
- `@smart-test-agent/db`: 49 tests
- `@smart-test-agent/shared`: 31 tests
- `@smart-test-agent/core`: 521 tests
- `@smart-test-agent/playwright-runner`: 105 tests
- `@smart-test-agent/server`: 109 tests

## License

MIT
