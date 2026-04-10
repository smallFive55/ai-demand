# Agent 指南 — ai-demand

本文件为在本仓库中协作的 AI 助手提供项目上下文与约束。人类维护者也可据此对齐约定。

## 项目是什么

**需求全流程管理系统**：AI 参与的需求接待、分析、任务管理与复盘平台；含双轨审批等流程。详细需求见 `_bmad-output/planning-artifacts/需求全流程管理系统-PRD.md`；架构决策见 `_bmad-output/planning-artifacts/architecture.md`。

## 环境与命令

- **Node.js** ≥ 22，**pnpm** ≥ 10（见根目录 `package.json` 的 `packageManager`）。
- 安装：`pnpm install`
- 开发：`pnpm dev`（前端 `http://localhost:5173`，API `http://localhost:8000`）
- 质量：`pnpm lint`、`pnpm test`、`pnpm build`
- 环境变量：复制 `.env.example` 为 `.env`。开发环境管理员默认账号见 `README.md`。

## 仓库结构


| 路径                       | 说明                                             |
| ------------------------ | ---------------------------------------------- |
| `apps/web`               | Vue 3 + Vite + TypeScript + Tailwind 4 + Pinia |
| `apps/api`               | NestJS 11 API                                  |
| `packages/contracts`     | API 契约与 DTO                                    |
| `packages/shared-types`  | 前后端共享业务类型                                      |
| `packages/eslint-config` | 共享 ESLint 配置                                   |
| `_bmad-output/`          | PRD、架构、实现记录（只读参考，非运行时依赖）                       |


前端建议按 `features` + `shared` 组织；后端按领域模块（与 PRD 中的 FR 映射一致，见架构文档）。

## API 与数据约定

- REST-first，OpenAPI；响应统一信封：`{ success, data, message, timestamp }`。
- 时间：ISO 8601 UTC；JSON 字段 **camelCase**；数据库列 **snake_case**（与架构文档一致）。

## 前端 / 产品关键约束（审批与通知）

实现或评审涉及**企业微信通知**与**审批**时，需遵守架构文档中的 UX 门禁，包括但不限于：

- 通知深链须带可恢复上下文参数（如 `requirementId`、`step`、`actionId` 等），避免只跳到列表。
- 落地页应能恢复审批上下文；参数无效时友好回退。
- 审批主路径优先**单页完成**（同页查看与决策），避免多跳链式流程作为主路径。

具体条文以 `_bmad-output/planning-artifacts/architecture.md` 中「UX Critical Constraints」为准。

## 单元测试规范

### 工具与入口


| 应用         | 运行器             | 环境                                   | 运行                                         |
| ---------- | --------------- | ------------------------------------ | ------------------------------------------ |
| `apps/web` | Vitest          | jsdom（见 `apps/web/vitest.config.ts`） | 根目录 `pnpm test`，或 `pnpm --filter web test` |
| `apps/api` | Jest（`ts-jest`） | Node（见 `apps/api/jest.config.json`）  | 根目录 `pnpm test`，或 `pnpm --filter api test` |


### 文件命名与位置

- **前端**：匹配 `src/**/*.{test,spec}.{ts,tsx}`。可与被测文件**同级**（如 `Foo.spec.ts` 与 `Foo.vue`），或放在邻近的 `__tests__/` 目录（如 `components/ui/__tests__/StatusBadge.spec.ts`）。
- **后端**：Jest 仅匹配 `***.spec.ts`**（路径任意，习惯与被测文件同级，如 `accounts.service.spec.ts`）。

### 编写原则

- **单元测试**聚焦单模块行为：对外部依赖（HTTP、数据库、Redis、文件、真实 LLM/企微）使用 **mock / 测试替身**，避免测试依赖本机服务或网络；需要真实 DB 或端到端流程时，用项目内已有的集成 / E2E 配置与目录，不冒充单元测试。
- **NestJS**：使用 `Test.createTestingModule` 组装被测 provider / controller，对协作者 `useValue` / `useFactory` mock，或按需引入小型测试模块；测完在 `afterEach` 中 `moduleRef.close()`，避免泄漏（与现有 `*.service.spec.ts` 一致）。
- **Vue 3**：使用 `@vue/test-utils` 的 `mount` / `shallowMount`；全局桩可在 `apps/web/tests/setup.ts` 中配置。
- **断言**：行为与边界清晰一条用例一个主题；命名用 `describe` / `it` 说明被测单元与场景，避免含糊的 `test 1`。

### 交付要求

- 修复缺陷或新增**核心业务规则、状态机、权限、数据转换**时，应补充或更新对应单元测试，保证 `pnpm test` 通过。
- 不为了覆盖率数字堆砌无断言测试；不提交 `only` / `skip` 长期留在主分支（临时调试除外且需还原）。

## AI 助手工作流

1. **边界与用例建议**：编写或修改任何代码后，主动列出相关**边界情况**（空值、极值、并发、权限、错误输入、状态组合等），并**建议**可覆盖这些情形的测试用例（可写具体 `it` 描述或场景表）；若用户希望落地，再按上文「单元测试规范」实现。
2. **先测后修（缺陷）**：出现错误（测试失败、运行时 bug、回归）时，**先**编写或调整一个**能稳定重现**该问题的测试（单元或最小复现），**再**改代码直至该测试通过；避免无测试支撑的「盲改」。
3. **被纠正后的反思**：每次用户指出错误或纠正方向时，简要说明**错在哪里**（误解需求、遗漏约束、工具误用等），并给出**可执行的一两点**后续做法（如「先读某文件再改」「某类变更必须先加测试」），以降低重复同类错误。

## 协作原则

- 变更范围聚焦需求；优先复用现有组件、模块与类型（`contracts` / `shared-types`）。
- 修改 API 时同步契约与调用方；重大行为变更对照 PRD / 架构说明。
- 不提交密钥；`.runtime-data` 等为本地/开发数据，勿当作生产方案文档。

