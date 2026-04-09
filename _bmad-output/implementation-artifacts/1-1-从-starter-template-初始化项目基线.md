# Story 1.1: 从 Starter Template 初始化项目基线

Status: done

## Story

As a 管理员,  
I want 使用架构指定的 starter template 完成项目初始化与基础配置,  
so that 团队可以在统一工程基线下继续实现后续治理与业务能力。

## Acceptance Criteria

1. **Given** 项目仓库已创建且尚未完成前后端工程初始化
  **When** 团队按架构要求执行 starter template 初始化（含依赖安装与基础配置）  
   **Then** 项目生成可运行的基础工程结构并通过基础 lint/test/build 检查  
   **And** 工程中落地统一的目录约定、环境配置样例与脚本命令，支持后续故事开发

## Tasks / Subtasks

- 初始化 monorepo 基线与目录结构（AC: 1）
  - 建立 `apps/`、`packages/`、`infra/`、`tests/` 顶层目录
  - 建立 `apps/web`（Vue3 + Vite + TS + Router + Pinia + Vitest + ESLint + Prettier）
  - 建立 `apps/api`（NestJS 11）基础骨架
  - 建立 workspace（建议 pnpm workspace）与根脚本（`dev`/`build`/`lint`/`test`）
- 统一工程规范与共享配置（AC: 1）
  - 在根目录配置 ESLint/Prettier/TypeScript 基线
  - 准备 `.env.example`（不包含敏感值）并约定环境变量命名
  - 约定 API 响应 envelope 与时间格式（ISO8601 UTC）并在 README 说明
- 打通最低可运行路径（AC: 1）
  - 确保 Web 与 API 可本地启动
  - 保证根级 `lint`、`test`、`build` 命令可执行
  - 增加最小健康检查接口（如 `/health`）与基础页面路由
- 为后续故事预埋结构（AC: 1）
  - 在前端预建 `features/admin` 与 `shared` 目录
  - 在后端预建 `modules/admin`、`modules/auth`、`modules/requirements`
  - 在 `packages/contracts` 中预留 OpenAPI/DTO 契约位置

## Dev Notes

### Story Foundation

- 本故事是 Epic 1 的第一条故事，是后续账号、角色、权限与业务板块治理能力的工程地基。
- 该故事重点不是实现业务功能，而是交付“可持续开发的统一基线”。
- 验收信号是：结构正确、命令可用、规范可执行，而不是功能覆盖率。

### Technical Requirements

- 前端技术基线：Vue 3 + Vite + TypeScript + Vue Router + Pinia + Vitest + ESLint + Prettier。
- 后端技术基线：NestJS v11.x，Node.js 22 LTS。
- 数据与缓存基线：MySQL 8.4 LTS、Redis 8.x（本故事可先完成接入骨架与配置占位）。
- API 风格：REST-first + OpenAPI；统一 `success/error` envelope。
- 时间与字段：时间统一 ISO8601 UTC；JSON 字段采用 `camelCase`。

### Architecture Compliance

- 必须遵守目录边界：前端 `features + shared`，后端按领域模块组织。
- 状态流转未来统一走状态机服务，本故事不得引入旁路写状态方式。
- 事件命名约定提前固化：`domain.entity.action.v1`。
- 审计、通知、AI 编排为后续核心能力，本故事只做结构预留，不做业务假实现。

### Library / Framework Guardrails

- `create-vue` 初始化需包含 TS/Router/Pinia/Vitest/ESLint/Prettier 选项。
- NestJS v11 与 Node 22 兼容，但需确保周边包使用 v11 兼容版本，避免 peer dependency 冲突。
- Redis 8 作为既定基线可用，但需优先采用稳定补丁版本（避免已知 8.0.0~8.0.5 风险）。

### File Structure Requirements

- 目标结构（最小落地）：
  - `apps/web/src/{app,features,shared}`
  - `apps/api/src/{config,common,modules,infra}`
  - `packages/{contracts,shared-types,eslint-config}`
  - `infra/`
  - `tests/`
- 禁止把业务代码直接堆在根目录 `src/`，避免偏离架构规划。
- 新增目录/脚本时，优先服务后续 Epic 1~2 的扩展路径，避免一次性过度设计。

### Testing Requirements

- 本故事必须通过基础质量门：`lint`、`test`、`build`。
- 至少具备：
  - Web 单测可运行（Vitest）
  - API 单测/启动测试可运行（Nest testing）
  - 一个最小集成检查（例如 health endpoint）
- 建议在 CI 中接入三道门：lint + contract + test（可先占位，后续故事补强）。

### Reinvention & Regression Prevention

- 不要重复创建另一套工程骨架；当前仓库已有 Vite + TS 初始化内容，应在现有基础上对齐架构，而不是推翻重建。
- 不要提前实现“权限、审批、通知、AI”业务细节；仅搭建可扩展骨架，避免后续返工。
- 保持命令、目录、配置的单一事实来源（README + 根脚本），避免多入口不一致。

### Latest Technical Information

- NestJS v11 已适配 Node 22 类型生态；升级时注意 `@nestjs/`* 相关依赖的版本联动。
- Redis 8 在 2025-2026 期间已有多个稳定性/安全补丁，生产建议锁定最新稳定 patch。
- `create-vue` 官方脚手架仍为 Vue 3 标准起点，优先使用而非手工拼装依赖。

### Project Context Reference

- 本项目当前无 `project-context.md`，已基于 `epics.md`、`architecture.md`、`ux-design-specification.md`、`需求全流程管理系统-PRD.md` 完成上下文构建。

### References

- [Source: `_bmad-output/planning-artifacts/epics.md`#Epic 1: 平台治理与权限基础]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Core Architectural Decisions]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Project Structure & Boundaries]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md`#Platform Strategy]
- [Source: `_bmad-output/planning-artifacts/需求全流程管理系统-PRD.md`#六、功能需求（按流程模块）]

## Dev Agent Record

### Agent Model Used

Claude claude-4.6-opus (Implementation)

### Debug Log References

- Web research: NestJS v11 + Node 22 compatibility
- Web research: Redis 8 release notes and patch stability
- TypeScript 6 deprecation: `baseUrl` requires `ignoreDeprecations: "6.0"`
- Jest config: JSON format avoids ts-node dependency; tsconfig needs `types: ["node", "jest"]`
- ESLint flat config in CJS project: rename to `.mjs` extension

### Implementation Plan

1. 将现有单体 Vue 应用重构为 pnpm monorepo
2. 使用 `git mv` 保留文件历史，将 `src/` 等移入 `apps/web/`
3. 创建 NestJS 11 后端 `apps/api/` 含 health endpoint
4. 建立 `packages/contracts`、`shared-types`、`eslint-config` 共享包
5. 配置根级 workspace 脚本并验证 lint/test/build 全链路

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- Story is implementation-ready with architecture guardrails and anti-regression guidance
- 从单体 Vue SPA 成功重构为 pnpm monorepo（6 个工作区项目）
- 现有前端代码通过 git mv 完整迁移至 apps/web/，保留 git 历史
- NestJS 11 后端 apps/api/ 已搭建，含 /api/health 端点及统一 response envelope
- packages/contracts 提供前后端共享 API 契约类型（ApiEnvelope, HealthResponse, PaginatedResponse）
- packages/shared-types 提供业务领域类型占位（EventName 类型约定）
- packages/eslint-config 提供可复用的 ESLint 基础配置
- 根级 `pnpm test`、`pnpm lint`、`pnpm build` 全部通过，无回归
- Web: 1 test file / 2 tests passed (Vitest)；API: 1 test file / 1 test passed (Jest)
- 前端预建 features/admin 与 shared 目录
- 后端预建 modules/admin、modules/auth、modules/requirements、config、infra 目录
- Code review 修复：注册全局 response interceptor 与 exception filter，health 响应统一为 envelope
- Code review 修复：CORS 从全开放改为基于 `CORS_ORIGIN` 的白名单配置（默认 `http://localhost:5173`）
- Code review 修复：前端 auth token 与 localStorage 持久化打通，避免 API 鉴权头缺失
- Code review 修复：补齐 API e2e 依赖 `supertest`/`@types/supertest` 并增加统一 envelope 断言

### File List

- `pnpm-workspace.yaml` — 新增：pnpm 工作区配置
- `package.json` — 修改：根工作区脚本与 pnpm 配置
- `package-lock.json` — 删除：迁移到 pnpm 后移除 npm lockfile
- `pnpm-lock.yaml` — 新增：pnpm 锁文件
- `tsconfig.json` — 修改：根级 TypeScript 基线配置
- `.env.example` — 修改：增加后端环境变量
- `.gitignore` — 修改：适配 monorepo
- `README.md` — 修改：monorepo 文档与 API 规约
- `apps/web/package.json` — 新增：前端包配置
- `apps/web/tsconfig.json` — 移动：解决方案级 TS 配置
- `apps/web/tsconfig.app.json` — 移动：Vue 应用 TS 配置
- `apps/web/tsconfig.node.json` — 移动：工具链 TS 配置
- `apps/web/vite.config.ts` — 移动：Vite 配置
- `apps/web/vitest.config.ts` — 移动：Vitest 配置
- `apps/web/eslint.config.js` — 移动：Vue ESLint 配置
- `apps/web/index.html` — 移动：入口 HTML
- `apps/web/env.d.ts` — 移动：环境类型声明
- `apps/web/src/`** — 移动：全部前端源码（组件、路由、Store、视图等）
- `apps/web/tests/setup.ts` — 移动：测试 setup
- `apps/api/package.json` — 新增：后端包配置
- `apps/api/tsconfig.json` — 新增：NestJS TS 配置
- `apps/api/tsconfig.build.json` — 新增：构建专用 TS 配置
- `apps/api/nest-cli.json` — 新增：Nest CLI 配置
- `apps/api/jest.config.json` — 新增：Jest 配置
- `apps/api/eslint.config.mjs` — 新增：API ESLint 配置
- `apps/api/.env.example` — 新增：后端环境变量样例
- `apps/api/src/main.ts` — 新增：NestJS 入口
- `apps/api/src/app.module.ts` — 新增：根模块
- `apps/api/src/app.controller.ts` — 新增：根控制器（/health）
- `apps/api/src/app.service.ts` — 新增：根服务
- `apps/api/src/app.controller.spec.ts` — 新增：控制器单元测试
- `apps/api/src/common/interceptors/response.interceptor.ts` — 新增：统一响应拦截器
- `apps/api/src/common/filters/http-exception.filter.ts` — 新增：全局异常过滤器
- `apps/api/src/modules/admin/.gitkeep` — 新增：管理模块占位
- `apps/api/src/modules/auth/.gitkeep` — 新增：认证模块占位
- `apps/api/src/modules/requirements/.gitkeep` — 新增：需求模块占位
- `apps/api/src/config/.gitkeep` — 新增：配置模块占位
- `apps/api/src/infra/.gitkeep` — 新增：基础设施模块占位
- `apps/api/test/app.e2e-spec.ts` — 新增：E2E 测试
- `apps/api/test/jest-e2e.json` — 新增：E2E Jest 配置
- `packages/contracts/package.json` — 新增：契约包配置
- `packages/contracts/tsconfig.json` — 新增：契约包 TS 配置
- `packages/contracts/src/index.ts` — 新增：API 契约类型定义
- `packages/shared-types/package.json` — 新增：共享类型包配置
- `packages/shared-types/tsconfig.json` — 新增：共享类型 TS 配置
- `packages/shared-types/src/index.ts` — 新增：业务领域类型
- `packages/eslint-config/package.json` — 新增：ESLint 配置包
- `packages/eslint-config/index.js` — 新增：共享 ESLint 基础配置
- `apps/web/src/features/admin/.gitkeep` — 新增：前端管理特性目录
- `apps/web/src/shared/.gitkeep` — 新增：前端共享目录
- `infra/.gitkeep` — 新增：基础设施目录占位
- `tests/.gitkeep` — 新增：集成测试目录占位
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 修改：状态更新
- `_bmad-output/implementation-artifacts/1-1-从-starter-template-初始化项目基线.md` — 修改：故事状态与记录

### Senior Developer Review (AI)

- Reviewer: Peng (AI)
- Review Date: 2026-04-08
- Outcome: Changes Requested → Fixed in same review cycle
- High Issues Fixed:
  - 全局响应 envelope 实际未生效（已在 `main.ts` 注册 interceptor/filter）
  - 鉴权 token 读取与持久化断链（已在 `auth` store 增加 localStorage 同步）
- Medium Issues Fixed:
  - CORS 全开放配置风险（已收敛为 `CORS_ORIGIN` 白名单）
  - Story File List 与实际变更不一致（补充 lockfile 变更并移除无 git 证据项）
  - e2e 未覆盖统一 envelope（已在 `app.e2e-spec.ts` 增加 envelope 断言）
- Validation:
  - `pnpm lint` ✅
  - `pnpm test` ✅
  - `pnpm --filter @ai-demand/api run test:e2e` ✅
  - `pnpm build` ✅

## Change Log

- 2026-04-08: 完成 Story 1.1 全部任务 — 从单体 Vue 应用重构为 pnpm monorepo，新增 NestJS 11 后端、共享包结构、根级质量门脚本
- 2026-04-08: 完成 code-review 修复项 — 统一响应中间件注册、CORS 收敛、auth token 持久化、e2e 契约断言与依赖补齐