# Story 3.1: 自动生成 PRD 与原型

Status: ready-for-dev

## Story

As a 需求交付经理,
I want 系统在需求接待成功后自动生成 PRD 和交互原型,
so that 我能快速审查可执行方案而不是等待人工产出。

## Acceptance Criteria

1. **Given** 某需求已通过 `RequirementsService.applyCollectingToReceived` 完成 `collecting → received` 状态迁移（LLM 自动路径或业务方手动修正路径） **When** Story 2.4 的 fire-and-forget 接待通知调度被触发 **Then** 在同一编排点必须同步以 fire-and-forget 模式调度 `SolutionGenerationService.scheduleForRequirement`，且：调度不得阻塞 HTTP 响应（与 Story 2.4 同语义，`RequirementsController.PATCH /:id/intake` 与 `POST /:id/messages` 在 LLM 生成 mock 挂起 10 s+ 时仍 < 500 ms 返回）；调度通过 `notificationsService.track()` 登记到既有 `OnApplicationShutdown` 排空通道，绝不引入新的进程级在飞 Promise 集合。
2. **Given** SolutionGenerationService 已被调度 **When** 服务开始生成 **Then** 必须按以下三阶段串行执行并实时回写 `requirement_solutions.generation_status` / `generation_phase`：① `analyzing`（解析 `collected_fields` + 板块准入说明 → 生成方案上下文）→ ② `generating_prd`（产出 Markdown 格式 PRD，结构必须包含「背景与目标 / 用户与角色 / 功能范围 / 数据约束 / 异常与边界 / 验收标准」六个章节，对应 PRD §六的 FR-A-01）→ ③ `generating_prototype`（产出单文件 HTML 原型字符串，原型必须自包含 CSS/JS、不得引用外网静态资源、且至少演示「表单填写、按钮点击、页面跳转」三类交互，对应 FR-A-02 / FR8）；任一阶段开始与结束都写一条 `requirement_solution_started` / `requirement_solution_done` 审计行，`reasonCode` 形如 `solution_phase_<analyzing|generating_prd|generating_prototype>`。
3. **Given** 三阶段全部成功 **When** SolutionGenerationService 提交结果 **Then** 必须在单一事务内：① 将 PRD Markdown 与原型 HTML 写入 `requirement_solutions` 行（首版 `version=1`，`generation_status='succeeded'`，`completed_at=now`）；② 通过条件 UPDATE `WHERE status='received'` 将 `requirements.status` 从 `received` 迁到 `pending_manager_review`（`affected<1` → 写 `solution_pending_review_concurrent_no_op` 审计行，**不再**重复发送通知，幂等返回）；③ 写一条 `requirement_status_change` 审计行（before=received / after=pending_manager_review / after.solutionVersion=1）；④ 调度一次面向 `BusinessUnit.deliveryManagerId` 的企微通知 `requirement.solution.generated.v1`，与 Story 2.4 共享 `dispatchWithRetryAndFallback` 编排（FR9 / FR-A-03 / SC-04）。
4. **Given** 生成过程中任何阶段抛错（LLM 超时 / 非 2xx / JSON 不可解析 / 数据库写失败） **When** SolutionGenerationService 进入失败处理 **Then** 必须：① 写 `requirement_solutions` 行（`generation_status='failed'`，`error_message` 截断 ≤ 1 KB，敏感字段（API key / Webhook ?key=）走 `sanitizeErrorMessage` 脱敏）；② 写 `requirement_solution_failed` 审计行（含失败阶段 / requestId / 已耗时）；③ **不**迁移 `requirements.status`（保持 `received`，便于运维触发重生成）；④ 通过 NotificationsService 调度面向交付经理的 `requirement.ai.task.failed.v1` 企微通知（NFR-08），文案至少包含：失败阶段、原因摘要（≤120 字）、建议人工介入动作（"打开需求详情，使用『重新生成』或人工上传覆盖版本"）；⑤ 失败重试不在本故事内自动化（避免 LLM 调用风暴，由 Story 3.2 的"重新生成"按钮人工触发）。
5. **Given** 任意已认证角色（业务方提交者本人 / 该板块交付经理 / admin） **When** 调用 `GET /v1/requirements/:id/solution`（汇总）/ `GET /v1/requirements/:id/solution/prd`（PRD Markdown，可选 `?format=download` 触发 `Content-Disposition: attachment; filename="<requirement-id>.md"`） / `GET /v1/requirements/:id/solution/prototype`（HTML 原文，`Content-Type: text/html; charset=utf-8`，**强制** `Content-Security-Policy: default-src 'self' 'unsafe-inline'; frame-ancestors 'self'` 与 `X-Frame-Options: SAMEORIGIN` 响应头） **Then** 返回最新版本数据；权限不符走"问题 + 原因 + 下一步"三段式 403；状态尚处 `received`（生成中）时 PRD/原型接口返回 425 Too Early 加引导文案，告知"方案仍在生成，请通过 `/solution/progress` 查询"，避免前端轮询竞争返回半成品。
6. **Given** 任意被授权读取的角色 **When** 调用 `GET /v1/requirements/:id/solution/progress` **Then** 返回 `{ generationStatus, generationPhase, startedAt, lastPhaseAt, completedAt, errorMessage }`；P95 ≤ 500 ms（NFR-03）；接口必须支持高频轮询（不写入审计、不触发副作用、命中数据库读副本时同样 ≤ 500 ms）。
7. **Given** 交付经理从企业微信 `requirement.solution.generated.v1` 通知深链进入 Web 端 **When** 路由 `/delivery-manager/approvals?requirementId=&step=manager-review&actionId=&source=wecom` 加载 **Then** `DeliveryManagerApprovalsLanding.vue` 必须放行 `step=manager-review`（与 Story 2.4 的 `step=review` 并列允许，逐步迁移到 manager-review 后续故事再统一）；落地后立即跳转或内嵌 `RequirementSolutionView.vue`（`/requirement/:id/solution`），首屏左侧栏渲染 PRD Markdown（带目录），右侧栏渲染原型预览（沙箱 iframe `sandbox="allow-scripts allow-forms"`，**禁止** `allow-same-origin` / `allow-top-navigation` / `allow-popups`，通过 `srcdoc` 注入 HTML），顶栏显示生成耗时（`completedAt - startedAt`），状态尚处生成中时显示 `AiGenerationProgress.vue`（三阶段进度条 + `aria-live="polite"` 阶段播报，对齐 UX `ux-design-specification.md` 第 387–401 行的"AI 进度可视化"）。
8. **Given** Story 2.4 已建立的 `notifications.service.ts` `dispatchWithRetryAndFallback` 编排骨架 **When** 新增 `notifyRequirementSolutionGenerated` / `notifyRequirementAiTaskFailed` 入口 **Then** 必须：① 严格复用既有 outbox(`dispatch_started`) → 重试循环 → 降级 `wecom_fallback_in_app_todo` 的模板，禁止自实现重试逻辑；② `notifications.types.ts` 新增 `NOTIFICATION_EVENTS.REQUIREMENT_SOLUTION_GENERATED='requirement.solution.generated.v1'`、`NOTIFICATION_EVENTS.REQUIREMENT_AI_TASK_FAILED='requirement.ai.task.failed.v1'` 与对应 payload 类型（`WecomRequirementSolutionGeneratedPayload` 含 `requirementTitle/businessUnitName/prdSummary(≤200 字)/prototypeAvailable:boolean/generationDurationSec/deepLinkParams`；`WecomRequirementAiTaskFailedPayload` 含 `failedPhase/errorSummary/suggestedAction/deepLinkParams`）；③ `wecom-notifier.port.ts` 同步追加两个 `send`* 方法（Noop 空实现 / Http 真实实现），Http 实现的深链路径默认 `/delivery-manager/approvals`、`step=manager-review` / `step=ai-failed`（覆写环境变量 `NOTIFICATION_SOLUTION_GENERATED_DEEP_LINK_PATH` / `NOTIFICATION_AI_FAILED_DEEP_LINK_PATH`）；④ `audit.service.ts` 的 `AuditEvent.action` 追加 `'requirement_solution_generated'` 与 `'requirement_ai_task_failed'`；⑤ NotificationsService 不得读 `requirement_solutions` 表（保持单一职责），所有渲染所需数据由 `SolutionGenerationService` 在调度时填入 payload。
9. **Given** 实现需可在未配置 `LLM_API_URL` 的本地与 CI 环境联调 **When** `LLM_API_URL` 未设置 **Then** 必须自动选用 `EchoLlmSolutionService`（与 `EchoLlmChatService` 同模块约定）：返回确定性 PRD 模板（依据 `collectedFields` 拼装六章节固定文案，含输入回放）+ 自包含 HTML 原型（演示三类交互：① `<form>` 含 `<input>` + `<button type="submit">` 提交、② 普通 `<button>` 切换 `data-test="prototype-toggle"` 区域显隐、③ 同文件多 `section` + `<a href="#section-2">` 锚点跳转，并配 `<script>` 监听 hashchange 切换页面）；测试场景下需具备稳定性能（生成 < 200 ms）以保障 jest 套件在默认 30 s 超时内通过。
10. **Given** 实现完成 **When** 执行回归测试 **Then** 至少覆盖（与 Story 2.4 基线 `13 suites / 142 tests` 对齐）：① `solution-generation.service.spec.ts`（≥ 14 用例：三阶段成功、各阶段超时 / 解析失败 / DB 写失败、并发幂等 no-op、状态迁移 + 通知调度恰好一次、失败路径调度 NFR-08 通知、Echo 与 Http 两实现下的契约一致性、`mentionedWecomUserIds=[]` 透传）；② `notifications.service.spec.ts` 增量（≥ 6 用例：`notifyRequirementSolutionGenerated` happy / 重试 / 降级 / 深链契约 + `notifyRequirementAiTaskFailed` happy / 降级）；③ `http-wecom-notifier.service.spec.ts` 增量（≥ 8 用例：两类深链默认 / 覆写 / `step=manager-review` 与 `step=ai-failed` 文案完整性 / `prdSummary` 截断 / `mentioned_list` 注入 / 错误脱敏）；④ `solution-generation.controller.spec.ts`（≥ 6 用例：404 / 425 / 403 / PRD 下载头 / 原型 CSP 头 / progress 不写审计）；⑤ `requirements.service.spec.ts` 同步增量（≥ 4 用例：`applyCollectingToReceived` 成功路径同步触发 `scheduleSolutionGeneration` 恰好一次；调度异常时落 `notification_orchestrator_unexpected` 审计但 HTTP 仍 <500 ms；并发 no-op 路径不调度生成；缺 `deliveryManagerId` 时跳过 FR9 通知但生成仍照常进行）；⑥ 前端 `RequirementSolutionView.spec.ts`（≥ 6 用例：生成中渲染进度 / 完成渲染 PRD + 原型 / iframe sandbox 属性断言 / 失败渲染三段式提示 / 角色守卫不通过时三段式提示 / 进度轮询在 unmount 后停止）；⑦ 端到端：合计后端 ≥ 16 suites / ≥ 180 tests 全绿（较 Story 2.4 的 13/142 基线净新增 ≥ 38 用例），前端不破坏 Story 2.4 的 4 suites / 22 tests 基线，新增解决方案视图至少 6 用例。

## Tasks / Subtasks

- 任务 1：建立 `apps/api/src/modules/approvals` 模块骨架（AC: 2, 3, 5, 6, 9）
  - 1.1 新增 `apps/api/src/modules/approvals/approvals.module.ts`：`imports: [TypeOrmModule.forFeature([RequirementEntity, RequirementSolutionEntity]), AuditModule, NotificationsModule]`，`providers: [SolutionGenerationService, EchoLlmSolutionService, HttpLlmSolutionService, { provide: LLM_SOLUTION, useFactory }]`，`controllers: [SolutionGenerationController]`，`exports: [SolutionGenerationService]`。
  - 1.2 在 `apps/api/src/app.module.ts` 注册 `ApprovalsModule`（位置紧跟 `RequirementsModule`，便于 DI 顺序追踪）。
  - 1.3 新增 `apps/api/src/database/entities/requirement-solution.entity.ts`：列对齐迁移文件（见任务 2），TypeORM 装饰器使用与既有 `RequirementEntity` 同款（`@PrimaryColumn` UUID + `@Column` snake_case 列名映射）。
  - 1.4 在 `apps/api/src/database/entities/index.ts` 导出 `RequirementSolutionEntity`。
- 任务 2：数据库迁移 `1744500000000-CreateRequirementSolutionsTable.ts`（AC: 2, 3, 4）
  - 2.1 `up` 创建表 `requirement_solutions`：列与索引：
    - `id varchar(36) PK`
    - `requirement_id varchar(36) NOT NULL`
    - `version int NOT NULL DEFAULT 1`
    - `generation_status varchar(32) NOT NULL`（`pending|in_progress|succeeded|failed`）
    - `generation_phase varchar(32) NULL`（`analyzing|generating_prd|generating_prototype|null`）
    - `prd_markdown longtext NULL`
    - `prototype_html longtext NULL`
    - `error_message text NULL`
    - `started_at datetime(3) NULL`
    - `completed_at datetime(3) NULL`
    - `created_at datetime(3) NOT NULL`
    - `updated_at datetime(3) NOT NULL`
    - `KEY IDX_requirement_solutions_requirement_id (requirement_id)`
    - `UNIQUE UQ_requirement_solutions_req_version (requirement_id, version)`
    - `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`（与 Story 2.1 迁移保持字符集一致）。
  - 2.2 `down` 反向 `DROP TABLE IF EXISTS`；不留外键（保持与既有 `requirements` 表的弱关联模式，避免迁移耦合）。
  - 2.3 在 `.env.example`、`apps/api/README.md` 的迁移节点列表（如有）追加本迁移说明。
- 任务 3：LLM Solution 端口与实现（AC: 2, 4, 9）
  - 3.1 新增 `apps/api/src/modules/approvals/llm/llm-solution.port.ts`：抽象类 `LlmSolutionPort`，方法签名：
    ```ts
    abstract generatePrd(input: { title: string; collectedFields: CollectedFields; businessUnitName: string; admissionRationale?: string }, opts: { timeoutMs: number }): Promise<{ markdown: string; summary: string }>
    abstract generatePrototype(input: { title: string; prdMarkdown: string }, opts: { timeoutMs: number }): Promise<{ html: string }>
    ```
    导出 `LLM_SOLUTION = 'LlmSolutionPort'` 注入令牌。
  - 3.2 新增 `http-llm-solution.service.ts`：复用 `resolveOpenAiChatCompletionsUrl`，使用与 `HttpLlmChatService` 同款超时 / API key / model 解析；PRD 阶段 system prompt 要求"严格按 6 章节输出 Markdown，最末单独一行 JSON `{"summary":"≤200 字摘要"}`"；原型阶段 system prompt 要求"输出单文件 HTML，包含 `<form>` 提交 / `<button>` 切换 / `<a href="#section">` 锚点跳转三类交互；禁止外部 `<link>` `<script src=>`"。两个方法都用 `AbortController` + `LLM_SOLUTION_TIMEOUT_MS`（默认 60 s，范围 [10 s, 300 s]）。
  - 3.3 新增 `echo-llm-solution.service.ts`：返回确定性 PRD 模板（六章节按 collectedFields 字段填充）+ 内嵌 `<form>` / 切换 `<button>` / 锚点 `<a>` 三类交互的 HTML（含 `data-test="prototype-form"` / `prototype-toggle` / `prototype-jump` 钩子供前端 spec 断言）。
  - 3.4 在 `approvals.module.ts` 用 factory 选择实现：`process.env.LLM_API_URL?.trim() ? http : echo`，与 `RequirementsModule` 选择 `HttpLlmChatService / EchoLlmChatService` 的模式严格一致。
- 任务 4：`SolutionGenerationService` 编排（AC: 1–4, 9）
  - 4.1 新增 `apps/api/src/modules/approvals/solution-generation.service.ts`，构造函数注入 `Repository<RequirementEntity>` / `Repository<RequirementSolutionEntity>` / `AuditService` / `NotificationsService` / `BusinessUnitsService` / `LlmSolutionPort`。
  - 4.2 公开 `scheduleForRequirement(input: { requirementId: string; actor: string; requestId: string; triggeredAt: string }): void` —— 内部以 `Promise.resolve().then(() => this.runGeneration(...)).catch(...)` 实现 fire-and-forget；通过 `notificationsService.track(task)` 登记到既有排空通道（**禁止**新建独立的 `Set<Promise>`，AC 1 硬约束）。
  - 4.3 公开 `runGeneration(input)`：
    - 步骤 A：原子写入 `requirement_solutions` 占位行（`generation_status='in_progress', generation_phase='analyzing', started_at=now, version=1`）；若 `(requirement_id, version=1)` 已存在则视为重复触发，写 `solution_generation_concurrent_no_op` 审计行并 return。
    - 步骤 B：分析阶段（写阶段审计 → 调用 `llm.generatePrd`）。
    - 步骤 C：写阶段切换 `generation_phase='generating_prd'` + 阶段审计 → 调用 `llm.generatePrototype`（PRD markdown 作为输入）。
    - 步骤 D：写阶段切换 `generation_phase='generating_prototype'` + 阶段审计 → 提交 PRD/原型到 `requirement_solutions`（`generation_status='succeeded', completed_at=now`）。
    - 步骤 E：条件 UPDATE `requirements WHERE status='received' SET status='pending_manager_review'`（AC3）。`affected<1` → 写 `solution_pending_review_concurrent_no_op` 审计行并 return（不调度通知）。
    - 步骤 F：调度 `notificationsService.notifyRequirementSolutionGenerated(...)`，payload 内嵌 `prdSummary`（来自 LLM 返回的 summary，截断 200 字）/ `prototypeAvailable=true` / `generationDurationSec`。
  - 4.4 失败处理：在 try/catch 内识别失败阶段（按当前 `generation_phase`）→ 写 `requirement_solutions` 失败行 → 写 `requirement_solution_failed` 审计 → 调度 `notificationsService.notifyRequirementAiTaskFailed(...)`（NFR-08）；**不**回退状态、不重试。
  - 4.5 公开 `getSolutionView(requirementId, actor)` / `getProgress(requirementId, actor)`：返回 DTO；其中 progress 接口必须不调用 AuditService（性能 + 防止审计噪声爆炸）。
  - 4.6 公开只读 `findActiveSolution(requirementId): Promise<RequirementSolutionEntity | null>` 供下游 / 测试使用，必须做软并发保护：`order: { version: 'DESC' }`。
- 任务 5：`SolutionGenerationController` 与 DTO（AC: 5, 6）
  - 5.1 新增 `apps/api/src/modules/approvals/solution-generation.controller.ts`，路由前缀 `v1/requirements/:id/solution`：
    - `GET ''` → 返回 `{ requirementId, version, generationStatus, generationPhase, prdSummary, prototypeAvailable, prdMarkdownLength, prototypeHtmlLength, startedAt, completedAt }`（不直接回 PRD/原型原文，避免大 payload）。
    - `GET '/progress'` → AC6。
    - `GET '/prd'` → 返回 `text/markdown; charset=utf-8`；带 `?format=download` 时设置 `Content-Disposition: attachment; filename="<id>.md"`。
    - `GET '/prototype'` → 返回 `text/html; charset=utf-8`，强制响应头 `Content-Security-Policy` / `X-Frame-Options: SAMEORIGIN`（AC5）。
  - 5.2 状态尚处 `received` 时，PRD/原型接口返回 425 + 三段式文案；`failed` 时返回 409 + 引导触发"重新生成"（Story 3.2 实现实际按钮）。
  - 5.3 权限校验复用 `assertCanReadRequirement` 的同款模式（业务方仅本人 / 交付经理只读 / admin 全量），通过统一 helper 避免重复（建议放在 `approvals/guards/solution-access.helper.ts`）。
  - 5.4 对应 DTO 类型移到 `packages/contracts/src/index.ts`：`RequirementSolutionView` / `RequirementSolutionProgress` / `RequirementSolutionGenerationStatus` / `RequirementSolutionGenerationPhase`；导出后被前后端共享。
- 任务 6：在 `RequirementsService.applyCollectingToReceived` 加挂 SolutionGeneration 调度（AC: 1, 10）
  - 6.1 `RequirementsModule` 增加 `imports: [..., ApprovalsModule]`；构造函数注入 `SolutionGenerationService`（无循环依赖：approvals 不 import requirements 模块）。
  - 6.2 在 `applyCollectingToReceived` 中，**紧跟** `scheduleReceivedNotification(...)` 之后追加 `this.scheduleSolutionGeneration({ requirementId, actor: actor.id, requestId, triggeredAt: occurredAtIso })`；位置严格在 Story 2.4 通知调度之后、方法返回 `true` 之前，确保两次 fire-and-forget 调度都受同一 `affected<1` 短路保护。
  - 6.3 新增 `protected scheduleSolutionGeneration(input)`：与 `scheduleReceivedNotification` 同款模板（fire-and-forget + `notificationsService.track(task)` + `notification_orchestrator_unexpected` 兜底审计）；**不要**新增 `track` 集合，复用同一通道。
  - 6.4 缺 `deliveryManagerId` 时仍触发生成（生成结果对未来配置补全有价值），仅 FR9 通知阶段会因 deliveryManagerId 缺失被 NotificationsService 内部日志告警。
- 任务 7：扩展 NotificationsService 与 Notifier（AC: 3, 4, 8）
  - 7.1 `notifications.types.ts`：新增两个事件常量与 payload 类型（见 AC8 描述）；保持既有 `RequirementDeepLinkParams` 形状不变，仅扩展 step 取值文档（manager-review / ai-failed）。
  - 7.2 `wecom-notifier.port.ts`：接口追加 `sendRequirementSolutionGenerated` / `sendRequirementAiTaskFailed`。
  - 7.3 `noop-wecom-notifier.service.ts`：两个空方法返回 `{}`。
  - 7.4 `http-wecom-notifier.service.ts`：复用 `buildDeepLink` / `requireAppWebBaseUrl` / `getWebhookUrl` / `getTimeoutMs` / `postTextMessage` / `normalizeMentions`；新增 `getSolutionGeneratedDeepLinkPath` / `getAiFailedDeepLinkPath` 解析（默认值与覆写 env 见 AC8）；文案模板：
    - 生成完成：`【需求方案已生成】{title}\n需求编号：{id}\n板块：{businessUnitName}\nPRD 摘要：{prdSummary}\n原型：{prototypeAvailable ? '可在线预览（沙箱）' : '未生成'}\n生成耗时：{generationDurationSec}s\n查看审查：{deepLink}`
    - AI 失败：`【AI 任务失败】{title}\n需求编号：{id}\n失败阶段：{failedPhase}\n原因：{errorSummary}\n建议：{suggestedAction}\n查看详情：{deepLink}`
  - 7.5 `notifications.service.ts`：新增 `notifyRequirementSolutionGenerated` / `notifyRequirementAiTaskFailed` 入口，**严格复用** `dispatchWithRetryAndFallback`（仅传入不同的 `auditAction` / `eventName` / `extraAfter` / `send` closure），禁止内嵌新的重试循环。
  - 7.6 `audit.service.ts`：`AuditEvent.action` 追加 `'requirement_solution_started'` / `'requirement_solution_done'` / `'requirement_solution_failed'` / `'requirement_solution_generated'` / `'requirement_ai_task_failed'`；保持 `audit_events.action` 列长度 ≤ 32 字符的既有约束（最长一条 31 字符，符合）。
- 任务 8：`packages/contracts` DTO 与前端 API 客户端（AC: 5–7）
  - 8.1 `packages/contracts/src/index.ts`：
    - 新增 `RequirementSolutionGenerationStatus = 'pending' | 'in_progress' | 'succeeded' | 'failed'`
    - 新增 `RequirementSolutionGenerationPhase = 'analyzing' | 'generating_prd' | 'generating_prototype' | null`
    - 新增 `RequirementSolutionView` / `RequirementSolutionProgress` 接口
    - **不**修改 `RequirementStatus` 联合（已有 `pending_manager_review`，本故事只新增使用）
  - 8.2 新增 `apps/web/src/features/analysis/api.ts`：`getSolution(id)` / `getSolutionProgress(id)` / `getPrdMarkdown(id)` / 提供 `getPrototypeUrl(id)` 拼装函数（不发请求；返回拼好的 `${VITE_API_BASE_URL}/v1/requirements/${id}/solution/prototype`，供 iframe `src` 使用）。
  - 8.3 `apps/web/src/api/client.ts`：新增 `getText` 与 `getRaw` helpers（PRD 下载与 progress 复用普通 JSON envelope；PRD 接口需要走 `text/markdown` 时补 `Accept` 头并解析为 `string`）。
- 任务 9：前端解决方案视图与组件（AC: 7, 10）
  - 9.1 新增 `apps/web/src/features/analysis/components/AiGenerationProgress.vue`：三阶段进度条 + `aria-live="polite"` 阶段播报；`data-test="ai-progress"` / `ai-progress-phase-<phase>` 钩子；接收 `progress: RequirementSolutionProgress` props。
  - 9.2 新增 `apps/web/src/features/analysis/components/PrdPreview.vue`：渲染 Markdown（首版可使用 `marked@^16` 或 `markdown-it@^14`，**优先 markdown-it 以利于 XSS 安全**：默认禁用 HTML、显式开 linkify；不引入额外样式库，沿用 Tailwind typography 工具类样式）；`data-test="prd-preview"` / `prd-toc`。
  - 9.3 新增 `apps/web/src/features/analysis/components/PrototypePreview.vue`：iframe 沙箱视图，`sandbox="allow-scripts allow-forms"`、`title="HTML 原型 (沙箱)"`、`referrerpolicy="no-referrer"`，`src` 取自 `getPrototypeUrl`（**不**用 `srcdoc`：避免触发同源风险，让浏览器走标准 fetch + CSP 头）；`data-test="prototype-preview"`。
  - 9.4 新增 `apps/web/src/views/requirement/RequirementSolutionView.vue`：路由参数 `:id`，挂载时启动 `getSolutionProgress` 轮询（默认 3 s 一次，状态 `succeeded|failed` 后停止）；状态 `in_progress` 渲染 `AiGenerationProgress`；状态 `succeeded` 渲染 `PrdPreview` + `PrototypePreview` 双栏（XL 屏 60/40，移动端 stack 叠放）+ 顶栏耗时；状态 `failed` 渲染三段式提示 + "联系交付经理"指引（重新生成按钮在 Story 3.2 实装）。
  - 9.5 `apps/web/src/router/index.ts`：新增路由 `/requirement/:id/solution`，`name: 'requirement-solution'`；放在既有 `requirement-detail` 同级 children 下；保留默认无路由守卫（权限由 API 层强制）。
  - 9.6 `apps/web/src/views/requirement/DeliveryManagerApprovalsLanding.vue`：扩展 `step` 白名单为 `'review' | 'manager-review'`；当 `step=manager-review` 且需求状态为 `pending_manager_review|received` 时，立即 `router.replace({ name: 'requirement-solution', params: { id: rid }, query: { source: 'wecom' } })`，保留深链 hint。
- 任务 10：`.env.example` 与文档更新（AC: 4, 8, 9）
  - 10.1 `.env.example`：
    - 新增 `LLM_SOLUTION_TIMEOUT_MS=60000`（注释：默认 60 s，范围 10–300 s；PRD/原型生成各阶段共用）。
    - 新增 `NOTIFICATION_SOLUTION_GENERATED_DEEP_LINK_PATH=/delivery-manager/approvals`、`NOTIFICATION_AI_FAILED_DEEP_LINK_PATH=/delivery-manager/approvals`（注释：对齐架构 `architecture.md:104` `/{role}/approvals` 契约）。
    - 在 Story 2.3/2.4 通知段落标题更新为 "Story 2.3 放弃 + Story 2.4 接待 + Story 3.1 方案生成"，并复用既有 `NOTIFICATION_MAX_ATTEMPTS` / `NOTIFICATION_BACKOFF_BASE_MS` / `NOTIFICATION_SHUTDOWN_GRACE_MS` 同时作用于新两个事件。
  - 10.2 不引入新的 `.env` 秘密字段（仅时延与路径配置）。
- 任务 11：测试与回归（AC: 1–10）
  - 11.1 后端：依据 AC10 的清单实施全部新增 spec；调用 `pnpm --filter @ai-demand/api test` 必须达到 ≥ 16 suites / ≥ 180 tests 全绿（基线 13/142）。
  - 11.2 前端：`pnpm --filter @ai-demand/web test` 在排除 Story 2.3 baseline 已记录的 `AccountManagementPanel.spec.ts` 预存在问题后保持现有 4 suites / 22 tests 无回归；新增 `RequirementSolutionView.spec.ts` ≥ 6 用例 + `AiGenerationProgress.spec.ts` ≥ 3 用例 + `PrototypePreview.spec.ts` ≥ 2 用例（断言 sandbox 属性不含 `allow-same-origin`）。
  - 11.3 控制器层异步解耦：在 `requirements.controller.spec.ts` 已有的 Story 2.4 两条用例上新增 1 条断言：`POST /:id/messages` 在 `notifyRequirementReceived` + `scheduleSolutionGeneration` 同时被 mock 挂起 10 s 时仍 < 500 ms 返回（AC1）。
  - 11.4 端到端集成：本故事不要求引入 Playwright，但需在 README 或 `apps/api/README.md` 增加"本地联调步骤"段落：①`pnpm --filter @ai-demand/api db:migrate run`；②不配 `LLM_API_URL` 的情况下提交一条对话需求，确认完成接待后 1–2 秒内 `requirement_solutions` 行 `generation_status=succeeded`；③前端访问 `/requirement/<id>/solution` 看到 PRD + 原型 iframe + "生成耗时"显示。

## Dev Notes

- 本故事聚焦 **FR-A-01 / FR-A-02 / FR9**（自动生成 PRD + 原型 + 生成完成通知交付经理），并落地 **NFR-04（异步 + 进度查询）/ NFR-08（AI 失败通知）/ SC-02（30 分钟内完成）/ SC-04（通知 1 分钟内送达）** 在本故事的部分。重点是把 Story 2.4 建立的"fire-and-forget + 审计 outbox + track() + onApplicationShutdown 排空"模板**第二次复用**：通知是骨架的第一个使用方，方案生成成为骨架的第二个使用方，验证骨架可以承载多类异步编排，避免日后每个 AI 任务都自己写一遍 `Set<Promise>` 与 `OnApplicationShutdown`。
- **状态机单点**：FR9 的通知触发与 `pending_manager_review` 迁移**只能**发生在 `SolutionGenerationService.runGeneration` 步骤 E/F；禁止从 controller 或 RequirementsService 旁路触发，否则会出现 Story 2.3/2.4 评审里反复强调的"两条路径各自派发一次"的重复面。
- **状态机不引入新主状态**：`generating_solution` 不进 `requirements.status` 联合（PRD §七的状态图也未列出此状态）；进度可视化通过 `requirement_solutions.generation_phase` 暴露，避免 `RequirementStatus` 类型膨胀影响 Story 2.x 既有断言（与 Story 2.4 对 `RequirementStatus` 联合保持向后兼容承诺一致）。
- **沙箱原型**：`PrototypePreview.vue` 必须使用 `sandbox="allow-scripts allow-forms"` 而非 `allow-same-origin`，否则原型可读 cookie / localStorage（含 `auth_token`），等同于把整套登录态泄漏到 AI 生成的 HTML。CSP 与 `X-Frame-Options: SAMEORIGIN` 由后端控制层强制，避免外站 iframe 嵌入本接口窃取 PRD / 原型内容。
- **30 分钟 SLA（SC-02）评估**：默认配置（PRD 60 s + 原型 60 s + 评估 / DB 写 < 5 s）下生成总耗时期望 ≤ 3 分钟，远低于 30 分钟门禁。但当真实 LLM 限流 / 排队时上限可达 5–10 分钟；在 Story 3.2 引入"重新生成"按钮前，本故事不做自动重试，避免触发 LLM 配额风暴。
- **NFR-08 边界**：本故事只在"方案生成失败"路径上落地 AI 失败通知；其它 AI 任务（任务拆分 / 架构生成 / 代码生成等）的失败通知由后续 Story 4.x / 5.x 各自实现，但都应复用本故事建立的 `notifyRequirementAiTaskFailed` 入口（保持单一通知模板与审计字段，避免运维侧出现"每条 AI 失败长得不一样"的乱象）。
- **架构偏离声明**：仍是进程内 fire-and-forget；BullMQ/Redis Queue 跨进程持久化属 follow-up（继承 Story 2.3/2.4 的 `[FUTURE-STORY]` 列表）。生产灰度阶段建议优先使用 `Echo` LLM 实现做端到端验证后再切真实 LLM。

### Technical Requirements

- 后端基线：NestJS 11.x、Node.js 22 LTS、MySQL 8.4 LTS、Redis 8.x、TypeORM；与 Story 2.4 完全一致。
- 事件命名：`domain.entity.action.v1` → `requirement.solution.generated.v1` / `requirement.ai.task.failed.v1`。
- 状态迁移：唯一入口为 `SolutionGenerationService.runGeneration` 步骤 E（条件 UPDATE `WHERE status='received'`），与 Story 2.4 的"条件 UPDATE 防并发"模板一致。
- API 规范：新增 4 个 GET 路由全部走统一 `success/error` 信封；PRD/原型原文接口为非 JSON 内容，但仍统一在错误路径返回信封（参考 NestJS `@Res({ passthrough: true })` 模式或 `ContentTypeInterceptor` 排除）。
- ISO8601 UTC 时间格式继续在审计 `occurredAt` / `attemptedAt` / `requirement_solutions.started_at` / `completed_at` 强制统一。
- 性能：进度接口 P95 ≤ 500 ms（NFR-03）；PRD / 原型生成的网络等待不允许阻塞 controller 层任何线程。

### Architecture Compliance

- 前后端模块映射：
  - `apps/api/src/modules/approvals/`（新增 — 与架构 `FR-A -> api/modules/approvals` 一致）
  - `apps/api/src/modules/requirements/`（仅追加 `scheduleSolutionGeneration` 方法 + 注入 `SolutionGenerationService`，不动其它现有逻辑）
  - `apps/api/src/modules/notifications/`（在 Story 2.3/2.4 基础上扩展事件 + payload 类型；不重写编排骨架）
  - `apps/api/src/modules/audit/`（仅 `AuditEvent.action` 联合扩展）
  - `apps/web/src/features/analysis/`（新增 — 与架构 `FR-A -> web/features/analysis` 一致）
  - `apps/web/src/views/requirement/RequirementSolutionView.vue`（解决方案视图主入口）
- UX 约束（`architecture.md` UX Critical Constraints + `ux-design-specification.md` §2.4 / §6 / §7）：
  - "通知深链必须标准化"：`step=manager-review` / `step=ai-failed` 两个新值与既有 `requirementId/actionId/source=wecom` 四元组完整契合 `/{role}/approvals` 形态；
  - "审批必须单页完成"：`RequirementSolutionView.vue` 内嵌 PRD + 原型双栏，**禁止**多跳"列表 → 详情 → PRD → 审批表单"；本故事完成内容预览，审批操作（通过 / 提改 / 上传覆盖）由 Story 3.2 在同一视图右栏追加；
  - "AI 进度可视化"（UX §7 第 387–401 行）：`AiGenerationProgress.vue` 三阶段进度条 + `aria-live="polite"` 播报对应"分析中 → 生成 PRD → 生成原型"；
  - "AI 先整理再呈现"：UI 默认展示结构化 PRD（六章节），原始对话不在首屏；如需查看，可后续 Story 提供"展开对话"区。
- 架构偏离声明：仍是进程内 fire-and-forget + audit outbox 语义；BullMQ/Redis Queue 接入 + AI 配额限流策略 → follow-up story（继承 Story 2.3/2.4 列表）。

### Library / Framework Requirements

- 后端：仅依赖既有栈，**不引入新依赖**；LLM 调用走 `globalThis.fetch` + `AbortController`（Node 22 原生），与 `HttpLlmChatService` 同款。
- 前端：建议引入 `markdown-it@^14`（MIT，受社区维护活跃；`marked@^16` 也可，但 markdown-it 默认禁用 HTML 输出，更利于 XSS 防护）。**首选 markdown-it**；安装命令：`pnpm --filter @ai-demand/web add markdown-it@^14 @types/markdown-it -D`（`-D` 仅对 types）。
- TypeORM `Repository.update({ criteria }, partial)` 的"条件 UPDATE"语义（Story 2.3/2.4 已验证）继续用于 `received → pending_manager_review` 的并发防护。
- Vue Router 4.x 现有 `meta` + `beforeEach` 守卫保持原状；`/requirement/:id/solution` 不需新增守卫（API 层校验）。

### File Structure Requirements

- 预期重点新增/修改路径：
  - `apps/api/src/modules/approvals/approvals.module.ts`（新增）
  - `apps/api/src/modules/approvals/solution-generation.service.ts`（新增）
  - `apps/api/src/modules/approvals/solution-generation.controller.ts`（新增）
  - `apps/api/src/modules/approvals/llm/llm-solution.port.ts`（新增）
  - `apps/api/src/modules/approvals/llm/http-llm-solution.service.ts`（新增）
  - `apps/api/src/modules/approvals/llm/echo-llm-solution.service.ts`（新增）
  - `apps/api/src/database/entities/requirement-solution.entity.ts`（新增）
  - `apps/api/src/database/entities/index.ts`（追加 export）
  - `apps/api/src/database/migrations/1744500000000-CreateRequirementSolutionsTable.ts`（新增）
  - `apps/api/src/modules/notifications/notifications.types.ts`（追加事件 + payload）
  - `apps/api/src/modules/notifications/wecom-notifier.port.ts`（追加端口方法）
  - `apps/api/src/modules/notifications/noop-wecom-notifier.service.ts`（追加空实现）
  - `apps/api/src/modules/notifications/http-wecom-notifier.service.ts`（追加发送实现 + 深链路径解析）
  - `apps/api/src/modules/notifications/notifications.service.ts`（追加 `notifyRequirementSolutionGenerated` / `notifyRequirementAiTaskFailed` 入口，复用 `dispatchWithRetryAndFallback`）
  - `apps/api/src/modules/audit/audit.service.ts`（`AuditEvent.action` 联合追加）
  - `apps/api/src/modules/requirements/requirements.module.ts`（`imports` 追加 `ApprovalsModule`）
  - `apps/api/src/modules/requirements/requirements.service.ts`（`applyCollectingToReceived` 加挂 `scheduleSolutionGeneration` + 新方法）
  - `apps/api/src/app.module.ts`（注册 `ApprovalsModule`）
  - `packages/contracts/src/index.ts`（新增 4 个解决方案相关类型）
  - `apps/web/src/features/analysis/api.ts`（新增）
  - `apps/web/src/features/analysis/components/AiGenerationProgress.vue`（新增）
  - `apps/web/src/features/analysis/components/PrdPreview.vue`（新增）
  - `apps/web/src/features/analysis/components/PrototypePreview.vue`（新增）
  - `apps/web/src/views/requirement/RequirementSolutionView.vue`（新增）
  - `apps/web/src/router/index.ts`（新增 `/requirement/:id/solution` 路由）
  - `apps/web/src/views/requirement/DeliveryManagerApprovalsLanding.vue`（扩展 `step` 白名单为 `'review' | 'manager-review'` + 跳转）
  - `apps/web/src/api/client.ts`（新增 `getText` helper）
  - `.env.example`（追加 `LLM_SOLUTION_TIMEOUT_MS` 与两个深链路径变量）
- 不得新增与 Story 2.4 重复的模块结构；新增 ApprovalsModule **不得**重复实现通知 / 审计 / 状态机骨架。
- 测试文件与被测源码同目录：`solution-generation.service.spec.ts` / `solution-generation.controller.spec.ts` / `http-llm-solution.service.spec.ts`（端口契约抽样）；前端新 `*.spec.ts` 与组件 / 视图同目录。

### Testing Requirements

- 后端单测门禁：≥ 16 suites / ≥ 180 tests 全绿；较 Story 2.4 的 13/142 净增 ≥ 38 用例。
- 前端：新增 ≥ 11 用例（视图 6 + 进度组件 3 + 原型预览 2）；保持 Story 2.4 的 4 suites / 22 tests（`DeliveryManagerApprovalsLanding.spec.ts` 7 + `RequirementChatView.spec.ts` 7 + 其余）无回归；新增对 `step=manager-review` 跳转的 1 条用例追加到 `DeliveryManagerApprovalsLanding.spec.ts`。
- 契约：
  - 通知深链参数完整性（`requirementId/step/actionId/source`）；
  - PRD / 原型接口的状态码门禁（425 生成中 / 409 失败 / 200 成功 / 403 越权 / 404 不存在）；
  - 原型接口响应头硬断言：`Content-Security-Policy` 与 `X-Frame-Options: SAMEORIGIN`；
  - iframe `sandbox` 属性硬断言（含 `allow-scripts allow-forms`，**不**含 `allow-same-origin`）。
- 异步解耦验证：在控制器层 mock `notifyRequirementReceived` 与 `scheduleSolutionGeneration` 同时挂起 10 s，断言 `POST /:id/messages` 与 `PATCH /:id/intake` 仍 < 500 ms 返回。
- 回归保护：禁止破坏 Story 2.3/2.4 已存在的 `notifications.service.spec.ts` / `http-wecom-notifier.service.spec.ts` / `requirements.service.spec.ts` / `RequirementChatView.spec.ts` 用例；如需重构共用工具（如抽出 `assertCanReadRequirement` 到 helper），必须采用 Story 2.4 同款的"先新增、后切换、再删旧"两阶段提交。

### Previous Story Intelligence (2.4)

- **可直接复用的模式**：
  - `dispatchWithRetryAndFallback` 编排骨架（`NotificationsService` 已抽象通用化，本故事新增两个事件**只需**传入不同 `auditAction` / `eventName` / `extraAfter` / `send` closure）；
  - `applyCollectingToReceived` 的"条件 UPDATE + 并发 no-op 审计"模板，本故事在 `received → pending_manager_review` 复用同款（`solution_pending_review_concurrent_no_op`）；
  - `scheduleReceivedNotification` 的"fire-and-forget + `notificationsService.track()` + `notification_orchestrator_unexpected` 兜底审计"模板，本故事新增 `scheduleSolutionGeneration` 严格仿写；
  - `buildDeepLink` / `requireAppWebBaseUrl` / `getWebhookUrl` / `getTimeoutMs` / `redactWebhookUrl` / `sanitizeErrorMessage` / `normalizeMentions` 全部直接复用；
  - 前端 `data-test` 选择器约定 + 三段式错误文案 + `isLikelyValidRequirementId` UUID 白名单；新增 `RequirementSolutionView.vue` 必须沿用同款约定。
- **避免回归**：
  - 不改动 `applyCollectingToReceived` 的现有签名与并发分支；新挂 `scheduleSolutionGeneration` 必须在 `scheduleReceivedNotification` 之后、`return true` 之前；
  - 不上调 `applyCollectingToReceived` 为 `public` 仅为方便测试；通过 `evaluateIntakeAndPersist` / `patchIntake` 两条调用链触发；
  - 不在 `RequirementsService` 内直接 `import { SolutionGenerationService }` 后又 `forwardRef`：通过 `ApprovalsModule` 导出 `SolutionGenerationService`、`RequirementsModule` 单向 `imports: [ApprovalsModule]` 即可，无循环；
  - 不复用 `RequirementChatView.vue` 作为 `RequirementSolutionView` 的父组件——交付经理视角（审查）与业务方视角（提交对话）分离，与 Story 2.4 关于 `/business/approvals` 与 `/delivery-manager/approvals` 不能共组件的判定一致。
- **Story 2.4 Round 3 遗留 Follow-ups 在本故事的继承处理**：
  - `[FUTURE-STORY] BullMQ/Redis Queue` 与 `userId → 企微 userid 映射`：不在本故事范围；新增代码仍保持"Producer 只调 NotificationsService / SolutionGenerationService、Http notifier 消费 `mentionedWecomUserIds`"的接口边界；
  - `[LOW] notifications.service.spec.ts 内 otherActor 未使用变量清理`：本故事会再次编辑该 spec，顺手清理（属 baseline clean-up，非本故事门禁）；
  - 进度接口 P95 ≤ 500 ms 的真实 DB 度量在 APM 接入后做（与 Story 2.2 listEnabledBusinessUnitsForIntake 同款 follow-up）。

### Git Intelligence Summary

- 提交粒度：沿用 Story 2.1–2.4 的"按故事粒度提交、`_bmad-output/implementation-artifacts/` 同步更新、`sprint-status.yaml` 在 `review → done` 切换时更新"约定。
- 高频再触修改文件：`.env.example` / `packages/contracts/src/index.ts` / `apps/api/src/modules/notifications/`* / `apps/api/src/modules/requirements/requirements.service.ts` / `apps/web/src/router/index.ts` / `apps/web/src/views/requirement/DeliveryManagerApprovalsLanding.vue`，本故事会再次命中。`git pull --rebase` 时优先保留 Story 2.3/2.4 行为完整性，再叠加本故事新增。
- 自动修复 / 评审返工：仍以**独立提交**而非 `amend` 落盘，保留代码评审链路可回放（与 Story 2.3 Round 2/3 / Story 2.4 一致）。

### Latest Tech Information

- **markdown-it 14.x**（如最终选用）：默认 `html: false` 禁用 inline HTML；启用 `linkify: true` 自动识别裸链接；`typographer: true` 智能引号；性能在 LongPRD（>20 KB）下 < 5 ms（V8）。如发现 PRD 含表格 / 代码块需求，可视情接入 `markdown-it-anchor` 与 `markdown-it-table-of-contents`，但本故事保持最小集合即可。
- **markdown-it XSS 守护**：即使 `html: false`，仍需对 LLM 返回的 markdown 做长度上限（≤ 200 KB）与字符白名单（禁止 `<script` 字面量）双重防护，避免 prompt injection 把脚本伪装为代码块逃逸。
- **iframe sandbox 浏览器兼容**：Chromium/Firefox/Safari 都已稳定支持 `sandbox="allow-scripts allow-forms"`；`allow-same-origin` 缺失时 iframe 内 `localStorage` / `cookie` 访问会抛 `SecurityError`，正是本故事所需。
- **NestJS 11 + TypeORM 0.3.x** 在 MySQL 下使用 `Repository.update({ criteria }, partial)` 的条件 UPDATE 行为（已在 Story 2.3/2.4 经实测）：单语句 `UPDATE ... WHERE id=? AND status=?` + `affectedRows` 回读；本故事在 `received → pending_manager_review` 复用同款。
- **企业微信 Webhook 文本消息**单条 ≤ 4096 字节（UTF-8）；本故事 PRD 摘要做 200 字截断、原型 HTML 不入消息体（仅深链跳转），不存在超长消息风险。
- **Node 22 fetch + AbortController**：`AbortError.message='The operation was aborted'`；`sanitizeErrorMessage` 已统一脱敏，复用即可。

### Project Context Reference

- 未发现独立 `project-context.md`；本故事上下文以以下文档为准：
  - `_bmad-output/planning-artifacts/epics.md`（FR7/FR8/FR9 与 Story 3.1/3.2/3.3 关系；Epic 3 的覆盖映射）
  - `_bmad-output/planning-artifacts/需求全流程管理系统-PRD.md`（FR-A-01/FR-A-02/FR-A-03、NFR-04/NFR-07/NFR-08、SC-02/SC-04、§七 状态机）
  - `_bmad-output/planning-artifacts/architecture.md`（FR-A → `web/features/analysis` + `api/modules/approvals` 映射；通知深链契约 `architecture.md:104`；UX Critical Constraints；事件命名 `domain.entity.action.v1`；状态机单点 + 条件 UPDATE 模板）
  - `_bmad-output/planning-artifacts/ux-design-specification.md`（§2.4 关键成功瞬间"30 分钟"；§6 体验原则；§7 AI 生成阶段进度可视化；§9 PRD/原型双视图布局；§14 PRDPrototypeSplitView 组件设想）
  - `_bmad-output/implementation-artifacts/2-4-接待成功通知交付经理.md`（fire-and-forget + outbox + track + onApplicationShutdown 平台能力；条件 UPDATE 防并发；前端深链落地组件与 `data-test` 约定）
  - `_bmad-output/implementation-artifacts/2-3-放弃路径与通知闭环.md`（`dispatchWithRetryAndFallback` 抽象骨架的最初模板；Round 3 follow-up 列表）
  - `_bmad-output/implementation-artifacts/2-2-ai-项目识别与准入判断.md`（`evaluateIntakeAndPersist` / `patchIntake` 双路径来源——本故事的 `applyCollectingToReceived` 触发点同款继承）

### Story Completion Status

- 状态设置为 `ready-for-dev`
- 完成说明：Ultimate context engine analysis completed - comprehensive developer guide created；后续 dev-story 工作流可直接依据本故事的 11 个任务 + 10 条 AC + AC↔Task 反向索引推进实现。

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (Cursor Agent — bmad-bmm-create-story)

### Debug Log References

### Completion Notes List

### File List

