# Smart Test Agent

PRD-Based UI Testing Agent System - AI-powered automated testing from PRD to Markdown reports.

## Overview

Smart Test Agent is an AI-powered automated testing system that implements a complete closed-loop from PRD → Test Case Generation → Playwright UI Automation (read/write operations) → AI Cross-Review → Source Code Localization & Root Cause Analysis → Markdown Defect Report.

## Architecture

```
smart-test-agent/
├── apps/
│   ├── web/                    # React + Ant Design frontend
│   └── server/                 # Express + tRPC backend
├── packages/
│   ├── core/                   # Core business logic
│   │   ├── orchestrator/       # State machine orchestration engine
│   │   ├── source-indexer/     # Source code indexer
│   │   ├── cli-adapter/        # Claude Code / Codex CLI adapter
│   │   ├── quality-gate/       # Quality gate calculator
│   │   ├── report-generator/   # Markdown report generator
│   │   └── target-profile/     # Target profile manager
│   ├── playwright-runner/      # Playwright executor
│   ├── shared/                 # Shared types and utilities
│   │   ├── types/              # TypeScript type definitions
│   │   ├── schemas/            # JSON Schema definitions
│   │   └── utils/              # Common utility functions
│   └── db/                     # Prisma database layer
├── prompts/                    # AI Prompt templates
│   ├── prd-parse.md
│   ├── ui-test-execute.md
│   └── review-results.md
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
- **Database**: PostgreSQL + Prisma
- **Testing**: Playwright
- **AI Integration**: Claude Code CLI + Codex CLI

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 9.0.0
- PostgreSQL (for database)

### Installation

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Run database migrations
pnpm db:migrate
```

### Development

```bash
# Start all apps in development mode
pnpm dev

# Build all packages
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck
```

## Core Features

1. **Source-Assisted Generation**: Parse frontend source code (router tables, page components, API definitions) to improve Playwright selector accuracy
2. **JS Script Direct Execution**: Generate complete Playwright JS test scripts and execute via `node` command
3. **Cross-Review Mechanism**: Claude Code execution + Codex review for double verification
4. **State Machine Driven**: 8-state state machine for test flow management with idempotency and exception recovery
5. **Quality Gates**: RC/APR/FR triple metrics for test quality assurance
6. **Markdown Reports**: Output easy-to-read and shareable Markdown format reports

## License

MIT
