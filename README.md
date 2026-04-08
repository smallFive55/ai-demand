# 需求全流程管理系统 (ai-demand)

AI 驱动的需求接待、分析、任务管理与复盘平台。
通过 AI 全流程参与与双轨审批机制，支撑端到端需求交付与复盘。

## 前置要求

- **Node.js** >= 22 (LTS)
- **pnpm** >= 10

## 快速开始

```bash
pnpm install
cp .env.example .env   # Windows: copy .env.example .env
pnpm dev
```

前端开发服务器: `http://localhost:5173`
后端 API 服务器: `http://localhost:8000`

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 并行启动前后端开发服务器 |
| `pnpm build` | 全量构建 |
| `pnpm test` | 运行所有工作区测试 |
| `pnpm lint` | ESLint 检查 |
| `pnpm format` | Prettier 格式化 |

## 项目结构

```
ai-demand/
├── apps/
│   ├── web/             # Vue 3 前端应用
│   └── api/             # NestJS 11 后端 API
├── packages/
│   ├── contracts/       # API 契约与 DTO 类型
│   ├── shared-types/    # 前后端共享业务类型
│   └── eslint-config/   # 共享 ESLint 配置
├── infra/               # 基础设施配置（预留）
├── tests/               # 跨应用集成测试（预留）
├── pnpm-workspace.yaml  # pnpm 工作区配置
└── package.json         # 根工作区脚本
```

## 技术栈

| 层级 | 选型 |
| --- | --- |
| 前端框架 | Vue 3 (Composition API) |
| 构建工具 | Vite |
| 语言 | TypeScript |
| 样式 | Tailwind CSS 4 |
| 状态管理 | Pinia |
| 路由 | Vue Router |
| 后端框架 | NestJS 11 |
| 运行时 | Node.js 22 |
| 数据库 | MySQL 8.4 (LTS) |
| 缓存 | Redis 8.x |
| 测试 | Vitest (前端) / Jest (后端) |
| 代码质量 | ESLint + Prettier |

## API 规约

- **风格**: REST-first + OpenAPI
- **响应格式**: 统一 `success/error` envelope（`{ success, data, message, timestamp }`）
- **时间格式**: ISO 8601 UTC
- **字段命名**: camelCase
- **事件命名**: `domain.entity.action.v1`

## 环境变量

复制 `.env.example` 为 `.env` 并按需填写。各应用可拥有独立 `.env` 文件。

| 变量 | 说明 |
| --- | --- |
| `VITE_API_BASE_URL` | 前端 API 基路径（默认 `/api`） |
| `VITE_APP_TITLE` | 应用标题 |
| `PORT` | API 服务端口（默认 `8000`） |
| `DB_*` | MySQL 数据库连接配置 |
| `REDIS_*` | Redis 连接配置 |
| `JWT_SECRET` | JWT 签名密钥 |
