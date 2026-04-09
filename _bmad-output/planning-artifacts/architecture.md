---

## stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]

inputDocuments:

- '_bmad-output/planning-artifacts/需求全流程管理系统-PRD.md'
- '_bmad-output/planning-artifacts/需求全流程管理系统-PRD-validation-report.md'
- '_bmad-output/planning-artifacts/ux-design-specification.md'
- '_bmad-output/planning-artifacts/product-brief-ai-demand-2026-03-07.md'
workflowType: 'architecture'
project_name: 'ai-demand'
user_name: 'Peng'
date: '2026-04-07'
lastStep: 8
status: 'complete'
completedAt: '2026-04-07'

# Architecture Decision Document

*This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together.*

## Project Context Analysis

- 34 条 FR，8 条 NFR，复杂度 Medium-High
- 关键外部依赖：企业微信（SSO/通知）、大模型/Agent
- 关键跨域关注：状态机、RBAC、审计、通知可靠性、异步任务编排

## Starter Template Evaluation

- Starter: `create-vue`（Vue 3 + Vite + TS + Router + Pinia + Vitest）
- 初始化命令：

```bash
npm create vue@latest ai-demand-web -- --typescript --router --pinia --vitest --eslint --prettier
```

## Core Architectural Decisions

### Critical

- Backend: NestJS v11.x
- DB: MySQL 8.4 LTS
- Cache/Queue: Redis 8.x
- Runtime: Node.js 22 LTS
- Auth: 企业微信 OAuth2 SSO + JWT
- API: REST-first + OpenAPI

### Important

- 事件驱动异步编排
- 分层 RBAC
- 审计数据独立通道
- 前端状态分层
- 统一错误码与观测标准

### Data Architecture

- Primary DB: MySQL 8.4 LTS（InnoDB）
- 聚合根：`Requirement`，关联 `ApprovalFlow`、`TaskBundle`、`AuditEvent`、`NotificationEvent`
- Migration：版本化迁移，发布前强制检查

## Implementation Patterns & Consistency Rules

- 命名：DB `snake_case`，API 复数资源，代码 `camelCase/PascalCase`
- 结构：前端 `features + shared`，后端按领域模块，测试分层
- 格式：统一 `success/error` 响应信封与 ISO8601 UTC 时间
- 通信：`domain.entity.action.v1` 事件命名，状态流转统一状态机服务

### UX Critical Constraints (Must Enforce)

- 通知深链必须标准化：所有“需用户行动”的企业微信通知必须携带可直达审批上下文的 URL 参数，最小集合为 `requirementId`、`step`、`actionId`（可选 `source=wecom`）；禁止仅跳转到列表页。
- 深链路由必须可恢复上下文：Web 端落地页收到深链参数后，必须自动定位目标需求、打开对应审批阶段视图，并高亮当前待决策对象；参数无效时给出可恢复回退（跳转需求详情并提示原因）。
- 审批必须单页完成：交付经理与业务方审批场景采用“内容区 + 侧边审批面板/底部行动条”模式，用户在同一页面完成查看、填写意见、通过/驳回；禁止“通知 -> 列表 -> 详情 -> 审批表单”的多跳链式审批作为主路径。
- 审批交互最小化跳转约束：审批主路径允许 0 次页面跳转；如存在二级编辑能力（如上传覆盖版本），必须以内联抽屉或同页弹层实现。
- 架构验收门禁：涉及通知与审批的故事验收时，必须增加两项检查——(1) 通知深链参数契约测试；(2) 单页审批完成率测试（从通知入口到提交决策全流程）。

## Project Structure & Boundaries

### Complete Project Directory Structure

```text
ai-demand/
├── apps/
│   ├── web/src/{app,features,shared}
│   └── api/src/{config,common,modules,infra}
├── packages/{contracts,shared-types,eslint-config}
├── infra/
└── tests/
```

### Requirements to Structure Mapping

- FR-R -> `web/features/intake` + `api/modules/requirements`
- FR-A -> `web/features/analysis` + `api/modules/approvals`
- FR-T -> `web/features/tasks` + `api/modules/tasks`
- FR-S -> `web/features/summary` + `api/modules/audit`
- FR-M -> `web/features/admin` + `api/modules/admin`

### Integration Points

- Internal：Web -> API（REST）；API -> Redis Queue；Worker -> LLM/WeCom
- External：企业微信 OAuth/消息 API；LLM API
- Notification Deep Link Contract：通知服务统一生成深链 `/{role}/approvals?requirementId=<id>&step=<stage>&actionId=<id>&source=wecom`，由前端路由守卫解析并恢复审批上下文

## Architecture Validation Results

### Coherence Validation ✅

- 决策兼容性：NestJS + MySQL + Redis + Node22 组合无冲突，契合中高复杂度业务流转场景
- 模式一致性：命名、结构、格式、通信、流程规则与技术栈一致
- 结构对齐：目录边界支持模块化实现与多代理并行开发

### Requirements Coverage Validation ✅

- FR 覆盖：5 大 FR 类别均映射到前后端明确模块
- NFR 覆盖：可用性、性能、安全、异步、审计、通知可靠性均有对应架构措施
- 跨域诉求：状态机/RBAC/审计/通知均有统一落点

### Implementation Readiness Validation ✅

- 决策完整性：关键技术与核心约束已明确，含数据库改为 MySQL
- 结构完整性：代码边界与集成点清晰，可直接进入实施拆分
- 规则完整性：足以约束多 AI 代理实现一致性

### Gap Analysis Results

- Critical Gaps: 无
- Important Gaps:
  - MySQL 索引策略（覆盖索引/组合索引）需在实施期按查询计划细化
  - 迁移工具（Prisma/TypeORM/Knex）需在首个实现故事中定版
- Nice-to-Have:
  - 增加“典型 API/事件 payload 样例”附录可进一步降低代理分歧

### Architecture Readiness Assessment

- Overall Status: **READY FOR IMPLEMENTATION**
- Confidence Level: **High**
- First Implementation Priority:
  - 初始化 monorepo + web/api 工程
  - 打通 MySQL + Redis + 基础认证骨架

## Completion & Handoff

- 架构工作流已完成（Step 1-8），文档可作为后续实现单一事实源
- 已完成 MySQL 调整并通过一致性校验（决策、模式、结构、映射均对齐）
- 实施阶段建议按顺序推进：
  1. `/bmad-bmm-create-epics-and-stories`（必需，进入可执行故事拆分）
  2. `/bmad-bmm-check-implementation-readiness`（必需，最终实施就绪校验）
  3. `/bmad-bmm-sprint-planning`（必需，进入实现 phase）

---

## stepsCompleted: [1, 2, 3, 4, 5, 6]

inputDocuments:

- '_bmad-output/planning-artifacts/需求全流程管理系统-PRD.md'
- '_bmad-output/planning-artifacts/需求全流程管理系统-PRD-validation-report.md'
- '_bmad-output/planning-artifacts/ux-design-specification.md'
- '_bmad-output/planning-artifacts/product-brief-ai-demand-2026-03-07.md'
workflowType: 'architecture'
project_name: 'ai-demand'
user_name: 'Peng'
date: '2026-04-07'

# Architecture Decision Document

*This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together.*

## Project Context Analysis

### Requirements Overview

- 34 条 FR，覆盖需求接待、需求分析、任务管理、需求总结、管理功能
- 8 条 NFR，重点驱动可用性、性能、异步任务、审计留痕、SSO、通知可靠性
- 复杂度：Medium-High，技术域：B2B Full-stack Web Application

### Technical Constraints & Dependencies

- 企业微信：OAuth/SSO、通知推送
- 大模型/Agent 编排：需求理解、PRD/原型生成、任务拆分
- 平台策略：Web 主端 + 企微轻入口

### Cross-Cutting Concerns

- SSO + RBAC
- 需求状态机一致性
- 审计日志全链路
- 异步任务编排与失败恢复
- 通知触发、重试、降级

## Starter Template Evaluation

### Primary Technology Domain

Full-stack Web（前端先行，后端在架构阶段确定）

### Selected Starter

- `create-vue`（Vue 3 + Vite + TS + Router + Pinia + Vitest）

```bash
npm create vue@latest ai-demand-web -- --typescript --router --pinia --vitest --eslint --prettier
```

## Core Architectural Decisions

### Critical

- Backend: NestJS v11.x
- DB: MySQL 8.4 LTS
- Cache/Queue: Redis 8.x
- Runtime: Node.js 22 LTS
- Auth: 企业微信 OAuth2 SSO + JWT
- API: REST-first + OpenAPI

### Important

- 事件驱动异步编排
- 分层 RBAC
- 审计数据独立通道
- 前端状态分层
- 统一错误码与观测标准

### Data Architecture

- Primary DB: MySQL 8.4 LTS（InnoDB，事务一致性，适配审批与状态机场景）
- Data Modeling: `Requirement` 聚合根，关联 `ApprovalFlow`、`TaskBundle`、`AuditEvent`、`NotificationEvent`
- Validation: API DTO + Domain 规则双层校验
- Migrations: 版本化 migration（向前兼容，发布前强制校验）
- Caching: Redis 用于会话、热点查询、幂等键

## Implementation Patterns & Consistency Rules

### Naming

- DB: `snake_case` + 复数表名
- API: `/api/v1/<plural-resource>`
- Code: 变量/函数 `camelCase`，类型/组件 `PascalCase`

### Structure

- 前端：`features + shared`
- 后端：按领域模块组织
- 单测与源码同目录，集成/E2E 在 `tests/`

### Format

- Success: `{ success, data, meta }`
- Error: `{ success, error, meta }`
- 日期：ISO 8601 UTC，字段：`camelCase`

### Communication/Process

- Event: `domain.entity.action.v1`
- 状态流转统一经状态机服务
- 错误三段式提示（问题+原因+下一步）
- AI 长任务分阶段进度反馈

## Project Structure & Boundaries

### Complete Project Directory Structure

```text
ai-demand/
├── README.md
├── package.json
├── pnpm-workspace.yaml
├── .env.example
├── .gitignore
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── cd.yml
├── apps/
│   ├── web/
│   │   └── src/
│   │       ├── app/
│   │       ├── features/
│   │       └── shared/
│   └── api/
│       └── src/
│           ├── config/
│           ├── common/
│           ├── modules/
│           └── infra/
├── packages/
│   ├── contracts/
│   ├── shared-types/
│   └── eslint-config/
├── infra/
└── tests/
```

### Architectural Boundaries

- API Boundary：`apps/api/src/modules/*` 暴露 REST 契约，不允许跨模块直连数据库
- Component Boundary：`apps/web/src/features/*` 内聚业务 UI，复用仅经 `shared/*`
- Service Boundary：跨域通信通过应用服务与事件总线，不直接调用他域 repository
- Data Boundary：数据库访问仅在 `infra/db` 与各模块 repository 层

### Requirements to Structure Mapping

- FR-R -> `web/features/intake` + `api/modules/requirements`
- FR-A -> `web/features/analysis` + `api/modules/approvals`
- FR-T -> `web/features/tasks` + `api/modules/tasks`
- FR-S -> `web/features/summary` + `api/modules/audit`
- FR-M -> `web/features/admin` + `api/modules/admin`

### Integration Points

- Internal：Web -> API（REST）；API -> Queue（Redis）；Queue Worker -> LLM/WeCom
- External：企业微信 OAuth/消息 API；LLM API
- Data Flow：前端操作 -> API 状态机 -> 事件发布 -> 异步处理 -> 通知/审计回写

---

## stepsCompleted: [1, 2, 3, 4, 5, 6]

inputDocuments:

- '_bmad-output/planning-artifacts/需求全流程管理系统-PRD.md'
- '_bmad-output/planning-artifacts/需求全流程管理系统-PRD-validation-report.md'
- '_bmad-output/planning-artifacts/ux-design-specification.md'
- '_bmad-output/planning-artifacts/product-brief-ai-demand-2026-03-07.md'
workflowType: 'architecture'
project_name: 'ai-demand'
user_name: 'Peng'
date: '2026-04-07'

# Architecture Decision Document

*This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together.*

## Project Context Analysis

### Requirements Overview

- 34 条 FR，覆盖需求接待、需求分析、任务管理、需求总结、管理功能
- 8 条 NFR，重点驱动可用性、性能、异步任务、审计留痕、SSO、通知可靠性
- 复杂度：Medium-High，技术域：B2B Full-stack Web Application

### Technical Constraints & Dependencies

- 企业微信：OAuth/SSO、通知推送
- 大模型/Agent 编排：需求理解、PRD/原型生成、任务拆分
- 平台策略：Web 主端 + 企微轻入口

### Cross-Cutting Concerns

- SSO + RBAC
- 需求状态机一致性
- 审计日志全链路
- 异步任务编排与失败恢复
- 通知触发、重试、降级

## Starter Template Evaluation

### Primary Technology Domain

Full-stack Web（前端先行，后端在架构阶段确定）

### Selected Starter

- `create-vue`（Vue 3 + Vite + TS + Router + Pinia + Vitest）

```bash
npm create vue@latest ai-demand-web -- --typescript --router --pinia --vitest --eslint --prettier
```

## Core Architectural Decisions

### Critical

- Backend: NestJS v11.x
- DB: PostgreSQL 18.x
- Cache/Queue: Redis 8.x
- Runtime: Node.js 22 LTS
- Auth: 企业微信 OAuth2 SSO + JWT
- API: REST-first + OpenAPI

### Important

- 事件驱动异步编排
- 分层 RBAC
- 审计数据独立通道
- 前端状态分层
- 统一错误码与观测标准

## Implementation Patterns & Consistency Rules

### Naming

- DB: `snake_case` + 复数表名
- API: `/api/v1/<plural-resource>`
- Code: 变量/函数 `camelCase`，类型/组件 `PascalCase`

### Structure

- 前端：`features + shared`
- 后端：按领域模块组织
- 单测与源码同目录，集成/E2E 在 `tests/`

### Format

- Success: `{ success, data, meta }`
- Error: `{ success, error, meta }`
- 日期：ISO 8601 UTC，字段：`camelCase`

### Communication/Process

- Event: `domain.entity.action.v1`
- 状态流转统一经状态机服务
- 错误三段式提示（问题+原因+下一步）
- AI 长任务分阶段进度反馈

## Project Structure & Boundaries

### Complete Project Directory Structure

```text
ai-demand/
├── README.md
├── package.json
├── pnpm-workspace.yaml
├── .env.example
├── .gitignore
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── cd.yml
├── apps/
│   ├── web/
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   ├── index.html
│   │   ├── public/
│   │   └── src/
│   │       ├── main.ts
│   │       ├── App.vue
│   │       ├── app/
│   │       │   ├── router/
│   │       │   └── stores/
│   │       ├── features/
│   │       │   ├── intake/
│   │       │   ├── analysis/
│   │       │   ├── tasks/
│   │       │   ├── summary/
│   │       │   └── admin/
│   │       └── shared/
│   │           ├── components/
│   │           ├── composables/
│   │           ├── services/
│   │           └── utils/
│   └── api/
│       ├── package.json
│       ├── nest-cli.json
│       ├── tsconfig.json
│       └── src/
│           ├── main.ts
│           ├── app.module.ts
│           ├── config/
│           ├── common/
│           ├── modules/
│           │   ├── auth/
│           │   ├── requirements/
│           │   ├── approvals/
│           │   ├── tasks/
│           │   ├── notifications/
│           │   ├── audit/
│           │   └── admin/
│           └── infra/
│               ├── db/
│               ├── queue/
│               └── wecom/
├── packages/
│   ├── contracts/
│   │   └── openapi/
│   ├── shared-types/
│   └── eslint-config/
├── infra/
│   ├── docker/
│   ├── k8s/
│   └── scripts/
└── tests/
    ├── integration/
    └── e2e/
```

### Architectural Boundaries

- API Boundary：`apps/api/src/modules/*` 暴露 REST 契约，不允许跨模块直连数据库
- Component Boundary：`apps/web/src/features/*` 内聚业务 UI，复用仅经 `shared/*`
- Service Boundary：跨域通信通过应用服务与事件总线，不直接调用他域 repository
- Data Boundary：数据库访问仅在 `infra/db` 与各模块 repository 层

### Requirements to Structure Mapping

- FR-R（需求接待）-> `web/features/intake` + `api/modules/requirements`
- FR-A（需求分析）-> `web/features/analysis` + `api/modules/approvals`
- FR-T（任务管理）-> `web/features/tasks` + `api/modules/tasks`
- FR-S（需求总结）-> `web/features/summary` + `api/modules/audit`
- FR-M（管理功能）-> `web/features/admin` + `api/modules/admin`

### Integration Points

- Internal：Web -> API（REST）；API -> Queue（Redis）；Queue Worker -> LLM/WeCom
- External：企业微信 OAuth/消息 API；LLM API
- Data Flow：前端操作 -> API 状态机 -> 事件发布 -> 异步处理 -> 通知/审计回写

### File Organization Patterns

- Config：集中在 `apps/*/src/config` 与根 `.env*`
- Source：领域驱动 + shared 抽象
- Test：单测同目录，集成/E2E 在顶层 `tests/`
- Asset：前端静态资源在 `apps/web/public`

---

## stepsCompleted: [1, 2, 3, 4, 5]

inputDocuments:

- '_bmad-output/planning-artifacts/需求全流程管理系统-PRD.md'
- '_bmad-output/planning-artifacts/需求全流程管理系统-PRD-validation-report.md'
- '_bmad-output/planning-artifacts/ux-design-specification.md'
- '_bmad-output/planning-artifacts/product-brief-ai-demand-2026-03-07.md'
workflowType: 'architecture'
project_name: 'ai-demand'
user_name: 'Peng'
date: '2026-04-07'

# Architecture Decision Document

*This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together.*

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

- 需求接待 (FR-R-01~06): 对话式 AI 需求收集、项目识别、准入判断、企微通知
- 需求分析 (FR-A-01~10): AI 生成 PRD + HTML 原型、双轨审批（交付经理 -> 业务方）、AI 任务拆分
- 任务管理 (FR-T-01~10): 任务审批、AI 团队组建、架构设计、交付审批、验收
- 需求总结 (FR-S-01~04): 30 天复盘提醒、上线成果、复盘生成
- 管理功能 (FR-M-01~04): 业务板块 CRUD、RBAC（账号/角色/权限）

共 34 条功能需求，覆盖 5 个功能模块，形成“需求提交->设计->执行->验收->复盘”的闭环流程。

**Non-Functional Requirements:**

- NFR-01: 业务时间可用性 >= 99.5%
- NFR-02: 页面加载 P95 <= 3s
- NFR-03: 非 AI 接口 P95 <= 500ms
- NFR-04: AI 任务异步执行 + 进度查询
- NFR-05: 全量审计日志保留 >= 1 年
- NFR-06: 企业微信 SSO / 扫码登录
- NFR-07: 企微通知解耦、失败重试与降级
- NFR-08: AI 任务失败告警并通知交付经理

这些 NFR 将直接驱动架构中的可用性设计、异步编排、观测与审计、鉴权体系与通知可靠性机制。

**Scale & Complexity:**
项目呈现中高复杂度，核心难点在于多阶段状态机一致性、AI 异步编排、审批链路可追溯，以及外部平台集成稳定性。

- Primary domain: Full-stack Web Application (B2B 内部系统)
- Complexity level: Medium-High
- Estimated architectural components: 10-14（接待编排、审批流、任务流、状态机、通知中心、鉴权/RBAC、审计、AI 网关、前端应用层、管理域等）

### Technical Constraints & Dependencies

- 企业微信 API：消息推送、OAuth/扫码登录
- 大模型 API / Agent 编排：需求理解、PRD/原型生成、任务拆分与执行支持
- 平台策略：Web 为主（PC 浏览器），企微 WebView 为通知与轻量入口
- 体验约束：需求状态实时可见、AI 进度可视化、审批尽量单页完成
- 质量约束：WCAG 2.2 AA 基线、响应式断点（sm/md/lg）支持

### Cross-Cutting Concerns Identified

- 认证与授权：企业微信 SSO + RBAC 细粒度权限控制
- 需求状态机：跨模块统一状态流转与回退规则
- 审计与追溯：全链路状态/审批/操作记录
- 通知编排：关键节点触发、失败重试、降级策略
- AI 异步任务治理：队列化执行、进度跟踪、失败告警与人工介入
- 一致性与可观测性：业务状态、任务状态、通知状态的一致性校验与监控

## Starter Template Evaluation

### Primary Technology Domain

Full-stack Web Application（当前阶段以前端 Web 主应用为基座，后端在后续架构决策中细化）。

### Starter Options Considered

1. **Vue Official create-vue**
2. **Vite create-vite (vue-ts template)**
3. **Nuxt**
4. **Quasar**

### Selected Starter: Vue 3 + Vite (create-vue)

**Initialization Command:**

```bash
npm create vue@latest ai-demand-web -- --typescript --router --pinia --vitest --eslint --prettier
```

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**

- Backend framework: **NestJS v11.x**
- Primary database: **PostgreSQL 18.x**
- Cache + queue backbone: **Redis 8.x**
- Runtime baseline: **Node.js 22 LTS**
- Auth integration: **企业微信 OAuth2 SSO + JWT 会话令牌**
- API style: **REST-first + OpenAPI**

**Important Decisions (Shape Architecture):**

- Event-driven async orchestration（AI 任务与通知解耦）
- 分层 RBAC（资源级权限 + 操作级权限）
- 审计日志独立通道（业务数据与审计数据分离）
- 前端状态分层（server-state / view-state / workflow-state）
- 统一错误码与可观测性标准

**Deferred Decisions (Post-MVP):**

- GraphQL 网关（当前 REST 已覆盖）
- 多租户物理隔离（MVP 先逻辑隔离）
- 多区域容灾（MVP 单区域 + 备份恢复策略）

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:**
15+ 个高风险冲突点（命名、结构、格式、事件、流程）已统一约束。

### Naming Patterns

**Database Naming Conventions:**

- 表名：`snake_case` 复数，如 `requirements`, `audit_events`
- 主键：统一 `id`
- 外键：`<entity>_id`，如 `requirement_id`
- 索引：`idx_<table>_<column>`, 唯一索引 `uk_<table>_<column>`

**API Naming Conventions:**

- REST 路径使用复数资源名：`/api/v1/requirements`
- 路由参数：`:id` 风格（服务端框架路由）
- Query 参数：`camelCase`（前后端统一）
- 自定义请求头：`X-Request-Id`, `X-Trace-Id`

**Code Naming Conventions:**

- TypeScript 变量/函数：`camelCase`
- 类/组件/类型：`PascalCase`
- 文件名：后端 `kebab-case.ts`，前端 Vue 单文件组件 `PascalCase.vue`
- 常量：`UPPER_SNAKE_CASE`

### Structure Patterns

**Project Organization:**

- 前端按 `features` + `shared` 组织，不按“纯类型目录”分裂
- 后端按领域模块组织（requirements, approvals, tasks, admin）
- Domain 规则在 service/domain 层，避免散落在 controller

**File Structure Patterns:**

- 单元测试与源码同目录：`*.spec.ts`
- 集成/E2E 测试在顶层 `tests/`
- 通用工具放 `shared/utils`，禁止各模块复制工具函数
- 配置按环境拆分并集中在 `config/`

### Format Patterns

**API Response Formats:**

- 成功响应统一：
  - `{ "success": true, "data": ..., "meta": { "requestId": "..." } }`
- 失败响应统一：
  - `{ "success": false, "error": { "code": "...", "message": "...", "details": ... }, "meta": { "requestId": "..." } }`

**Data Exchange Formats:**

- JSON 字段统一 `camelCase`
- 时间统一 ISO 8601 UTC 字符串
- 布尔值严格 `true/false`
- 空值允许 `null`，禁止用空字符串表示缺失

### Communication Patterns

**Event System Patterns:**

- 事件名：`domain.entity.action.v1`，如 `requirement.status.changed.v1`
- 事件载荷最小字段：
  - `eventId`, `eventName`, `occurredAt`, `actorId`, `entityId`, `payload`
- 事件必须可幂等消费（使用 `eventId` 去重）

**State Management Patterns:**

- 前端 store action 命名：`verbNoun`（如 `fetchRequirements`）
- 服务端状态流转必须通过统一状态机服务，不允许旁路更新
- UI 状态与服务端状态分离，禁止把临时 UI 状态写入业务实体

### Process Patterns

**Error Handling Patterns:**

- 业务错误与系统错误分层编码
- 所有错误日志必须带 `requestId/traceId`
- 用户提示采用“问题 + 原因 + 下一步”三段式
- 可重试错误标记 `retryable=true`

**Loading State Patterns:**

- 列表页：局部 skeleton；详情页：区域 loading，不做全屏阻断
- AI 长任务：阶段进度显示（分析中/生成中/校验中）
- 提交动作必须禁用重复点击并提供进行中反馈

### Enforcement Guidelines

**All AI Agents MUST:**

- 严格遵循本节命名与响应格式规范
- 新增接口前先对齐 OpenAPI 契约
- 涉及状态流转时必须补充审计与事件发布

**Pattern Enforcement:**

- PR 模板加入一致性检查清单
- CI 增加 lint + contract + test 三道门
- 违规项记录到 `architecture.md` 的变更记录区域并统一修订

### Pattern Examples

**Good Examples:**

- `GET /api/v1/requirements?projectId=abc123`
- Event: `requirement.status.changed.v1`
- Table: `approval_records`, FK: `requirement_id`

**Anti-Patterns:**

- 混用 `snake_case` 与 `camelCase` 字段
- 同一资源出现 `/requirement` 和 `/requirements` 两种路径
- 在 controller 直接写复杂业务规则导致多代理实现分叉

---

## stepsCompleted: [1, 2, 3, 4]

inputDocuments:

- '_bmad-output/planning-artifacts/需求全流程管理系统-PRD.md'
- '_bmad-output/planning-artifacts/需求全流程管理系统-PRD-validation-report.md'
- '_bmad-output/planning-artifacts/ux-design-specification.md'
- '_bmad-output/planning-artifacts/product-brief-ai-demand-2026-03-07.md'
workflowType: 'architecture'
project_name: 'ai-demand'
user_name: 'Peng'
date: '2026-04-07'

# Architecture Decision Document

*This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together.*

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

- 需求接待 (FR-R-01~06): 对话式 AI 需求收集、项目识别、准入判断、企微通知
- 需求分析 (FR-A-01~10): AI 生成 PRD + HTML 原型、双轨审批（交付经理 -> 业务方）、AI 任务拆分
- 任务管理 (FR-T-01~10): 任务审批、AI 团队组建、架构设计、交付审批、验收
- 需求总结 (FR-S-01~04): 30 天复盘提醒、上线成果、复盘生成
- 管理功能 (FR-M-01~04): 业务板块 CRUD、RBAC（账号/角色/权限）

共 34 条功能需求，覆盖 5 个功能模块，形成“需求提交->设计->执行->验收->复盘”的闭环流程。

**Non-Functional Requirements:**

- NFR-01: 业务时间可用性 >= 99.5%
- NFR-02: 页面加载 P95 <= 3s
- NFR-03: 非 AI 接口 P95 <= 500ms
- NFR-04: AI 任务异步执行 + 进度查询
- NFR-05: 全量审计日志保留 >= 1 年
- NFR-06: 企业微信 SSO / 扫码登录
- NFR-07: 企微通知解耦、失败重试与降级
- NFR-08: AI 任务失败告警并通知交付经理

这些 NFR 将直接驱动架构中的可用性设计、异步编排、观测与审计、鉴权体系与通知可靠性机制。

**Scale & Complexity:**
项目呈现中高复杂度，核心难点在于多阶段状态机一致性、AI 异步编排、审批链路可追溯，以及外部平台集成稳定性。

- Primary domain: Full-stack Web Application (B2B 内部系统)
- Complexity level: Medium-High
- Estimated architectural components: 10-14（接待编排、审批流、任务流、状态机、通知中心、鉴权/RBAC、审计、AI 网关、前端应用层、管理域等）

### Technical Constraints & Dependencies

- 企业微信 API：消息推送、OAuth/扫码登录
- 大模型 API / Agent 编排：需求理解、PRD/原型生成、任务拆分与执行支持
- 平台策略：Web 为主（PC 浏览器），企微 WebView 为通知与轻量入口
- 体验约束：需求状态实时可见、AI 进度可视化、审批尽量单页完成
- 质量约束：WCAG 2.2 AA 基线、响应式断点（sm/md/lg）支持

### Cross-Cutting Concerns Identified

- 认证与授权：企业微信 SSO + RBAC 细粒度权限控制
- 需求状态机：跨模块统一状态流转与回退规则
- 审计与追溯：全链路状态/审批/操作记录
- 通知编排：关键节点触发、失败重试、降级策略
- AI 异步任务治理：队列化执行、进度跟踪、失败告警与人工介入
- 一致性与可观测性：业务状态、任务状态、通知状态的一致性校验与监控

## Starter Template Evaluation

### Primary Technology Domain

Full-stack Web Application（当前阶段以前端 Web 主应用为基座，后端在后续架构决策中细化）。

### Starter Options Considered

1. **Vue Official create-vue**
  - 优势：官方维护、与 Vue 生态一致、可交互选择 TypeScript/Router/Pinia/Vitest/ESLint/Prettier
  - 适配度：最高，和现有 UX 技术偏好完全一致
  - 风险：需要我们自行补齐企业级目录规范与工程约束（可控）
2. **Vite create-vite (vue-ts template)**
  - 优势：最轻量、启动快、自由度高
  - 适配度：高
  - 风险：默认配置更“薄”，需额外手动加入 Pinia/Router/Vitest 等
3. **Nuxt**
  - 优势：SSR/全栈能力强、约定优于配置
  - 适配度：中等（本项目当前以内部系统 SPA 工作台为主）
  - 风险：引入更多框架约束，超出当前 MVP 所需复杂度
4. **Quasar**
  - 优势：组件与平台能力完整
  - 适配度：中等偏低（已明确 Tailwind + Headless UI 自建设计系统）
  - 风险：与既定 UI 技术路线冲突，后续替换成本高

### Selected Starter: Vue 3 + Vite (create-vue)

**Rationale for Selection:**
该方案与 PRD + UX 规范的既定技术方向完全一致，且保持最小约束与最大可控性。它能在不偏离现有设计系统策略的前提下，快速建立稳定工程底座，并为后续后端/异步编排架构决策留足空间。

**Initialization Command:**

```bash
npm create vue@latest ai-demand-web -- --typescript --router --pinia --vitest --eslint --prettier
```

**Architectural Decisions Provided by Starter:**

- Language & Runtime: Vue 3 + TypeScript 工程基线
- Styling Solution: 接入 Tailwind CSS 4 与 Headless UI（不强绑定 UI 库）
- Build Tooling: Vite 原生构建链路
- Testing Framework: Vitest 单测基线
- Code Organization: Vue Router + Pinia 的标准化组织起点
- Development Experience: dev server + HMR + ESLint + Prettier

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**

- Backend framework: **NestJS v11.x**（模块化、DI、适合复杂流程编排）
- Primary database: **PostgreSQL 18.x**
- Cache + queue backbone: **Redis 8.x**
- Runtime baseline: **Node.js 22 LTS**
- Auth integration: **企业微信 OAuth2 SSO + JWT 会话令牌**
- API style: **REST-first + OpenAPI**

**Important Decisions (Shape Architecture):**

- Event-driven async orchestration（AI 任务与通知解耦）
- 分层 RBAC（资源级权限 + 操作级权限）
- 审计日志独立通道（业务数据与审计数据分离）
- 前端状态分层（server-state / view-state / workflow-state）
- 统一错误码与可观测性标准

**Deferred Decisions (Post-MVP):**

- GraphQL 网关（当前 REST 已覆盖）
- 多租户物理隔离（MVP 先逻辑隔离）
- 多区域容灾（MVP 单区域 + 备份恢复策略）

### Data Architecture

- **Primary DB:** PostgreSQL 18.x  
Rationale: 事务一致性强、状态机与审计场景契合、JSONB 适配 AI 结构化产物。
- **Data Modeling:** 以 `Requirement` 为聚合根，关联 `ApprovalFlow`、`TaskBundle`、`AuditEvent`、`NotificationEvent`。
- **Validation:** API 入站 DTO 校验 + Domain 层业务规则校验双层机制。
- **Migrations:** 版本化 migration（前向兼容），发布流程强制迁移检查。
- **Caching:** Redis 用于会话、热点看板查询、短时幂等键。

### Authentication & Security

- **Authentication:** 企业微信 OAuth2 登录后换发平台 JWT（短期 access + 可轮换 refresh）。
- **Authorization:** RBAC + 业务板块边界校验（角色权限与资源归属双重判定）。
- **API Security:** 网关层限流、签名校验（对外 webhook）、CSRF/XSS 基线防护。
- **Data Protection:** 传输全链路 TLS，敏感配置与密钥统一密管。
- **Audit:** 关键操作（审批、状态流转、权限变更）强制落审计日志。

### API & Communication Patterns

- **API Pattern:** REST-first，按领域分组路由（requirements/approvals/tasks/admin）。
- **Documentation:** OpenAPI 3.x 自动生成 + 契约评审流程。
- **Error Standard:** 统一错误结构（code/message/details/requestId）。
- **Async Communication:** AI 生成、任务拆分、通知发送通过队列事件驱动处理。
- **Rate Limiting:** 用户维度 + 接口维度双策略；AI 触发接口设置更严格阈值。

### Frontend Architecture

- **State Strategy:** Pinia 按领域拆 store；异步数据采用查询层缓存策略。
- **Component Architecture:** 原子组件 -> 复合组件 -> 业务组件三级分层。
- **Routing:** 角色化路由守卫（业务方/交付经理/管理员）+ 懒加载分包。
- **Performance:** 首屏关键路由预加载、长列表虚拟化、通知与状态更新增量刷新。
- **Bundle Optimization:** Vite 动态分块，图标与大型依赖按需加载。

### Infrastructure & Deployment

- **Hosting:** 容器化部署（前后端分离服务），优先单集群多环境（dev/staging/prod）。
- **CI/CD:** lint + test + build + security scan + migration check + deploy gate。
- **Environment Config:** 12-factor 风格，配置与密钥分离管理。
- **Monitoring/Logging:** 指标（SLA/SLO）+ 日志聚合 + 链路追踪，覆盖 AI 任务成功率与通知送达率。
- **Scaling:** API 服务水平扩缩容；队列 worker 按任务积压弹性扩容。

### Decision Impact Analysis

**Implementation Sequence:**

1. 初始化前后端工程与基础 CI
2. 认证授权与用户身份打通（企微 SSO + RBAC）
3. Requirement 聚合与状态机落库
4. 审批流与审计日志打通
5. AI 异步任务编排与通知中心
6. 前端工作台联调与性能优化

**Cross-Component Dependencies:**

- 状态机定义决定审批流、通知触发与审计事件模型
- 鉴权模型直接影响 API 设计与前端路由守卫
- 队列与事件设计影响 AI 任务可靠性与可观测性

---

## stepsCompleted: [1, 2, 3]

inputDocuments:

- '_bmad-output/planning-artifacts/需求全流程管理系统-PRD.md'
- '_bmad-output/planning-artifacts/需求全流程管理系统-PRD-validation-report.md'
- '_bmad-output/planning-artifacts/ux-design-specification.md'
- '_bmad-output/planning-artifacts/product-brief-ai-demand-2026-03-07.md'
workflowType: 'architecture'
project_name: 'ai-demand'
user_name: 'Peng'
date: '2026-04-07'

# Architecture Decision Document

*This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together.*

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

- 需求接待 (FR-R-01~06): 对话式 AI 需求收集、项目识别、准入判断、企微通知
- 需求分析 (FR-A-01~10): AI 生成 PRD + HTML 原型、双轨审批（交付经理 -> 业务方）、AI 任务拆分
- 任务管理 (FR-T-01~10): 任务审批、AI 团队组建、架构设计、交付审批、验收
- 需求总结 (FR-S-01~04): 30 天复盘提醒、上线成果、复盘生成
- 管理功能 (FR-M-01~04): 业务板块 CRUD、RBAC（账号/角色/权限）

共 34 条功能需求，覆盖 5 个功能模块，形成“需求提交->设计->执行->验收->复盘”的闭环流程。

**Non-Functional Requirements:**

- NFR-01: 业务时间可用性 >= 99.5%
- NFR-02: 页面加载 P95 <= 3s
- NFR-03: 非 AI 接口 P95 <= 500ms
- NFR-04: AI 任务异步执行 + 进度查询
- NFR-05: 全量审计日志保留 >= 1 年
- NFR-06: 企业微信 SSO / 扫码登录
- NFR-07: 企微通知解耦、失败重试与降级
- NFR-08: AI 任务失败告警并通知交付经理

这些 NFR 将直接驱动架构中的可用性设计、异步编排、观测与审计、鉴权体系与通知可靠性机制。

**Scale & Complexity:**
项目呈现中高复杂度，核心难点在于多阶段状态机一致性、AI 异步编排、审批链路可追溯，以及外部平台集成稳定性。

- Primary domain: Full-stack Web Application (B2B 内部系统)
- Complexity level: Medium-High
- Estimated architectural components: 10-14（接待编排、审批流、任务流、状态机、通知中心、鉴权/RBAC、审计、AI 网关、前端应用层、管理域等）

### Technical Constraints & Dependencies

- 企业微信 API：消息推送、OAuth/扫码登录
- 大模型 API / Agent 编排：需求理解、PRD/原型生成、任务拆分与执行支持
- 平台策略：Web 为主（PC 浏览器），企微 WebView 为通知与轻量入口
- 体验约束：需求状态实时可见、AI 进度可视化、审批尽量单页完成
- 质量约束：WCAG 2.2 AA 基线、响应式断点（sm/md/lg）支持

### Cross-Cutting Concerns Identified

- 认证与授权：企业微信 SSO + RBAC 细粒度权限控制
- 需求状态机：跨模块统一状态流转与回退规则
- 审计与追溯：全链路状态/审批/操作记录
- 通知编排：关键节点触发、失败重试、降级策略
- AI 异步任务治理：队列化执行、进度跟踪、失败告警与人工介入
- 一致性与可观测性：业务状态、任务状态、通知状态的一致性校验与监控

## Starter Template Evaluation

### Primary Technology Domain

Full-stack Web Application（当前阶段以前端 Web 主应用为基座，后端在后续架构决策中细化）。

### Starter Options Considered

1. **Vue Official create-vue**
  - 优势：官方维护、与 Vue 生态一致、可交互选择 TypeScript/Router/Pinia/Vitest/ESLint/Prettier
  - 适配度：最高，和现有 UX 技术偏好完全一致
  - 风险：需要我们自行补齐企业级目录规范与工程约束（可控）
2. **Vite create-vite (vue-ts template)**
  - 优势：最轻量、启动快、自由度高
  - 适配度：高
  - 风险：默认配置更“薄”，需额外手动加入 Pinia/Router/Vitest 等
3. **Nuxt**
  - 优势：SSR/全栈能力强、约定优于配置
  - 适配度：中等（本项目当前以内部系统 SPA 工作台为主）
  - 风险：引入更多框架约束，超出当前 MVP 所需复杂度
4. **Quasar**
  - 优势：组件与平台能力完整
  - 适配度：中等偏低（已明确 Tailwind + Headless UI 自建设计系统）
  - 风险：与既定 UI 技术路线冲突，后续替换成本高

### Selected Starter: Vue 3 + Vite (create-vue)

**Rationale for Selection:**
该方案与 PRD + UX 规范的既定技术方向完全一致，且保持最小约束与最大可控性。  
它能在不偏离现有设计系统策略的前提下，快速建立稳定工程底座，并为后续后端/异步编排架构决策留足空间。

**Initialization Command:**

```bash
npm create vue@latest ai-demand-web -- --typescript --router --pinia --vitest --eslint --prettier
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**

- Vue 3 + TypeScript 工程基线
- 标准化 TS 配置与 Vue SFC 类型支持

**Styling Solution:**

- Starter 不强绑定 UI 框架，适合接入 Tailwind CSS 4 与 Headless UI（符合既定路线）

**Build Tooling:**

- Vite 原生构建链路（本地开发、打包、优化）
- 与现代前端工具链兼容性高

**Testing Framework:**

- Vitest 单测基线（可后续扩展 e2e，如 Playwright）

**Code Organization:**

- Vue Router 路由层 + Pinia 状态层的标准化组织起点
- 便于按“基础组件/复合组件/业务组件”分层演进

**Development Experience:**

- 开发服务器与热更新
- ESLint + Prettier 统一代码风格
- 适合中等经验团队快速协作落地

## **Note:** Project initialization using this command should be the first implementation story.

## stepsCompleted: [1, 2]

inputDocuments:

- '_bmad-output/planning-artifacts/需求全流程管理系统-PRD.md'
- '_bmad-output/planning-artifacts/需求全流程管理系统-PRD-validation-report.md'
- '_bmad-output/planning-artifacts/ux-design-specification.md'
- '_bmad-output/planning-artifacts/product-brief-ai-demand-2026-03-07.md'
workflowType: 'architecture'
project_name: 'ai-demand'
user_name: 'Peng'
date: '2026-04-07'

# Architecture Decision Document

*This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together.*

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

- 需求接待 (FR-R-01~06): 对话式 AI 需求收集、项目识别、准入判断、企微通知
- 需求分析 (FR-A-01~10): AI 生成 PRD + HTML 原型、双轨审批（交付经理 -> 业务方）、AI 任务拆分
- 任务管理 (FR-T-01~10): 任务审批、AI 团队组建、架构设计、交付审批、验收
- 需求总结 (FR-S-01~04): 30 天复盘提醒、上线成果、复盘生成
- 管理功能 (FR-M-01~04): 业务板块 CRUD、RBAC（账号/角色/权限）

共 34 条功能需求，覆盖 5 个功能模块，形成“需求提交->设计->执行->验收->复盘”的闭环流程。

**Non-Functional Requirements:**

- NFR-01: 业务时间可用性 >= 99.5%
- NFR-02: 页面加载 P95 <= 3s
- NFR-03: 非 AI 接口 P95 <= 500ms
- NFR-04: AI 任务异步执行 + 进度查询
- NFR-05: 全量审计日志保留 >= 1 年
- NFR-06: 企业微信 SSO / 扫码登录
- NFR-07: 企微通知解耦、失败重试与降级
- NFR-08: AI 任务失败告警并通知交付经理

这些 NFR 将直接驱动架构中的可用性设计、异步编排、观测与审计、鉴权体系与通知可靠性机制。

**Scale & Complexity:**
项目呈现中高复杂度，核心难点在于多阶段状态机一致性、AI 异步编排、审批链路可追溯，以及外部平台集成稳定性。

- Primary domain: Full-stack Web Application (B2B 内部系统)
- Complexity level: Medium-High
- Estimated architectural components: 10-14（接待编排、审批流、任务流、状态机、通知中心、鉴权/RBAC、审计、AI 网关、前端应用层、管理域等）

### Technical Constraints & Dependencies

- 企业微信 API：消息推送、OAuth/扫码登录
- 大模型 API / Agent 编排：需求理解、PRD/原型生成、任务拆分与执行支持
- 平台策略：Web 为主（PC 浏览器），企微 WebView 为通知与轻量入口
- 体验约束：需求状态实时可见、AI 进度可视化、审批尽量单页完成
- 质量约束：WCAG 2.2 AA 基线、响应式断点（sm/md/lg）支持

### Cross-Cutting Concerns Identified

- 认证与授权：企业微信 SSO + RBAC 细粒度权限控制
- 需求状态机：跨模块统一状态流转与回退规则
- 审计与追溯：全链路状态/审批/操作记录
- 通知编排：关键节点触发、失败重试、降级策略
- AI 异步任务治理：队列化执行、进度跟踪、失败告警与人工介入
- 一致性与可观测性：业务状态、任务状态、通知状态的一致性校验与监控

---

## stepsCompleted: [1]

inputDocuments:

- '_bmad-output/planning-artifacts/需求全流程管理系统-PRD.md'
- '_bmad-output/planning-artifacts/需求全流程管理系统-PRD-validation-report.md'
- '_bmad-output/planning-artifacts/ux-design-specification.md'
- '_bmad-output/planning-artifacts/product-brief-ai-demand-2026-03-07.md'
workflowType: 'architecture'
project_name: 'ai-demand'
user_name: 'Peng'
date: '2026-04-07'

# Architecture Decision Document

## *This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together.*

## stepsCompleted: [1]

inputDocuments:

- '_bmad-output/planning-artifacts/需求全流程管理系统-PRD.md'
- '_bmad-output/planning-artifacts/ux-design-specification.md'
- '_bmad-output/planning-artifacts/product-brief-ai-demand-2026-03-07.md'
workflowType: 'architecture'
project_name: 'ai-demand'
user_name: 'Peng'
date: '2026-04-07'

# Architecture Decision Document — 需求全流程管理系统

*This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together.*

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

- 需求接待 (FR-R-01~06): 对话式 AI 需求收集、项目识别、准入判断、企微通知
- 需求分析 (FR-A-01~10): AI 生成 PRD + HTML 原型、双轨审批（交付经理 → 业务方）、AI 任务拆分
- 任务管理 (FR-T-01~10): 任务审批、AI 团队组建、架构设计、交付审批、验收
- 需求总结 (FR-S-01~04): 30 天复盘提醒、上线成果、复盘生成
- 管理功能 (FR-M-01~04): 业务板块 CRUD、RBAC（账号/角色/权限）

共 34 条功能需求，覆盖 5 个功能模块。

**Non-Functional Requirements:**

- NFR-01: 业务时间可用性 ≥ 99.5%
- NFR-02: 页面加载 P95 ≤ 3s
- NFR-03: 非 AI 接口 P95 ≤ 500ms
- NFR-04: AI 任务异步执行 + 进度查询
- NFR-05: 全量审计日志 ≥ 1 年
- NFR-06: SSO / 企微扫码登录
- NFR-07: 企微通知解耦 + 失败重试降级
- NFR-08: AI 任务失败企微通知

**Scale & Complexity:**

- Primary domain: Web Application (B2B 内部系统)
- Complexity level: Medium-High
- 核心技术挑战: AI 服务集成、对话式交互、异步任务、实时状态同步、企微集成

### Technical Constraints & Dependencies

- 企业微信 API (消息推送 + OAuth SSO)
- 大模型 API / Agent 编排
- Web 优先 (PC 浏览器)，企微 WebView 辅助

### Cross-Cutting Concerns

- 认证与授权 (SSO + RBAC)
- 企微通知 (所有状态流转节点)
- 审计日志 (全量状态变更)
- AI 任务编排与失败处理
- 需求状态机 (核心数据模型)

## Starter Template Evaluation

### Primary Technology Domain

Full-stack Web Application — 基于 UX 设计规范中明确的技术选型。

### Selected Starter: Vue 3 + Vite (Manual Bootstrap)

**Rationale:**
UX 设计规范已明确技术栈: Vue 3 (Composition API) + Tailwind CSS 4 + Headless UI (Vue)。
采用手动初始化而非脚手架，确保每个技术决策与 PRD/UX 规范完全对齐。

**Frontend Technology Stack:**


| Layer         | Choice                  | Version | Rationale                |
| ------------- | ----------------------- | ------- | ------------------------ |
| Framework     | Vue 3 (Composition API) | ^3.5    | UX 规范指定                  |
| Build Tool    | Vite                    | ^6.x    | Vue 生态首选，HMR 极速          |
| Styling       | Tailwind CSS            | ^4.x    | UX 规范指定，CSS-first config |
| UI Primitives | Headless UI (Vue)       | ^1.x    | UX 规范指定，无样式可访问性组件        |
| Icons         | Heroicons               | ^2.x    | UX 规范指定                  |
| Router        | Vue Router              | ^4.x    | SPA 路由                   |
| State         | Pinia                   | ^2.x    | Vue 官方状态管理               |
| Language      | TypeScript              | ^5.x    | 类型安全                     |
| Testing       | Vitest                  | ^3.x    | Vite 生态测试                |
| Linting       | ESLint + Prettier       | Latest  | 代码质量                     |


**Backend Technology Stack (待决策):**

- 后端框架、数据库、任务队列等在架构决策阶段确定。

