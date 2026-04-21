import type { CollectedFields, EnabledBusinessUnitSummary, RequirementStatus } from '@ai-demand/contracts'
import { randomUUID } from 'crypto'
import {
  BadRequestException,
  ForbiddenException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { RequirementFieldSnapshotEntity } from '../../database/entities/requirement-field-snapshot.entity'
import { RequirementMessageEntity } from '../../database/entities/requirement-message.entity'
import { RequirementEntity } from '../../database/entities/requirement.entity'
import type { RequestWithActor } from '../../common/guards/admin-auth.guard'
import { AuditService } from '../audit/audit.service'
import { BusinessUnitsService } from '../admin/business-units/business-units.service'
import type { BizUnit } from '../admin/business-units/business-units.types'
import { NotificationsService } from '../notifications/notifications.service'
import { LLM_CHAT, LlmChatPort, type IntakeSuggestion, type LlmChatTurn } from './llm/llm-chat.port'

const REQUIREMENT_STATUSES = {
  COLLECTING: 'collecting' as const,
  ABANDONED: 'abandoned' as const,
  RECEIVED: 'received' as const,
} as const

/** 单轮对话补全默认超时（毫秒）；公网 / 百炼等较慢时可设 `LLM_COMPLETION_TIMEOUT_MS` */
const LLM_COMPLETION_TIMEOUT_DEFAULT_MS = 10_000
const LLM_COMPLETION_TIMEOUT_MIN_MS = 3_000
const LLM_COMPLETION_TIMEOUT_MAX_MS = 180_000

function getLlmCompletionTimeoutMs(): number {
  const raw = process.env.LLM_COMPLETION_TIMEOUT_MS?.trim()
  if (!raw) return LLM_COMPLETION_TIMEOUT_DEFAULT_MS
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n)) return LLM_COMPLETION_TIMEOUT_DEFAULT_MS
  return Math.min(Math.max(n, LLM_COMPLETION_TIMEOUT_MIN_MS), LLM_COMPLETION_TIMEOUT_MAX_MS)
}

/** 准入单独打分调用（PATCH / 补充分数）；可通过 LLM_ADMISSION_TIMEOUT_MS 覆盖 */
const ADMISSION_SCORE_TIMEOUT_DEFAULT_MS = 4_000
const ADMISSION_SCORE_TIMEOUT_MIN_MS = 2_000
const ADMISSION_SCORE_TIMEOUT_MAX_MS = 60_000

function getLlmAdmissionScoreTimeoutMs(): number {
  const raw = process.env.LLM_ADMISSION_TIMEOUT_MS?.trim()
  if (!raw) return ADMISSION_SCORE_TIMEOUT_DEFAULT_MS
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n)) return ADMISSION_SCORE_TIMEOUT_DEFAULT_MS
  return Math.min(Math.max(n, ADMISSION_SCORE_TIMEOUT_MIN_MS), ADMISSION_SCORE_TIMEOUT_MAX_MS)
}

function toIso(d: Date): string {
  return d.toISOString()
}

function emptyCollected(): CollectedFields {
  return {}
}

function mergeCollected(prev: CollectedFields, patch: Partial<CollectedFields>): CollectedFields {
  const next: CollectedFields = { ...prev }
  for (const key of Object.keys(patch) as (keyof CollectedFields)[]) {
    const v = patch[key]
    if (typeof v === 'string' && v.trim() !== '') {
      next[key] = v.trim()
    }
  }
  return next
}

function isCollectedCoreComplete(f: CollectedFields): boolean {
  return (
    !!f.goalBackground?.trim() && !!f.coreScope?.trim() && !!f.successCriteria?.trim()
  )
}

function buildCollectedSummary(f: CollectedFields): string {
  const parts: string[] = []
  if (f.goalBackground?.trim()) parts.push(`目标/背景：${f.goalBackground.trim()}`)
  if (f.coreScope?.trim()) parts.push(`范围：${f.coreScope.trim()}`)
  if (f.successCriteria?.trim()) parts.push(`成功标准：${f.successCriteria.trim()}`)
  return parts.join('\n')
}

function mapMessage(e: RequirementMessageEntity) {
  return {
    id: e.id,
    requirementId: e.requirementId,
    role: e.role as 'user' | 'ai' | 'system',
    content: e.content,
    createdAt: toIso(e.createdAt),
  }
}

@Injectable()
export class RequirementsService {
  private readonly logger = new Logger(RequirementsService.name)

  constructor(
    @InjectRepository(RequirementEntity)
    private readonly reqRepo: Repository<RequirementEntity>,
    @InjectRepository(RequirementMessageEntity)
    private readonly msgRepo: Repository<RequirementMessageEntity>,
    @InjectRepository(RequirementFieldSnapshotEntity)
    private readonly snapRepo: Repository<RequirementFieldSnapshotEntity>,
    private readonly auditService: AuditService,
    private readonly businessUnitsService: BusinessUnitsService,
    private readonly notificationsService: NotificationsService,
    @Inject(LLM_CHAT) private readonly llm: LlmChatPort,
  ) {}

  assertBusinessActor(actor: RequestWithActor['actor']): void {
    if (!actor || actor.role !== 'business') {
      throw new ForbiddenException(
        '问题：无法提交需求。原因：当前账号不是业务方角色。下一步：请使用业务方账号登录后再试。',
      )
    }
  }

  /**
   * 业务方/管理员/交付经理只读：启用板块列表（非管理员专用 /admin/business-units/enabled）。
   * 纯 DB 查询路径；NFR3（P95≤500ms）应在 APM 对 GET 打点度量。
   */
  async listEnabledBusinessUnitsForIntake(
    actor: RequestWithActor['actor'],
    _requestId: string,
  ): Promise<EnabledBusinessUnitSummary[]> {
    void _requestId
    if (
      !actor ||
      (actor.role !== 'business' &&
        actor.role !== 'admin' &&
        actor.role !== 'delivery_manager')
    ) {
      throw new ForbiddenException(
        '问题：无法获取板块列表。原因：当前角色无权访问。下一步：请使用业务方或具备追溯权限的账号。',
      )
    }
    const rows = await this.businessUnitsService.listEnabled()
    return rows.map((u) => ({
      id: u.id,
      name: u.name,
      description: u.description,
      functionList: u.functionList,
    }))
  }

  async patchIntake(
    id: string,
    businessUnitId: string,
    actor: RequestWithActor['actor'],
    requestId: string,
  ) {
    this.assertBusinessActor(actor)
    if (!actor) throw new ForbiddenException('未授权')

    const trimmed = businessUnitId?.trim()
    if (!trimmed) {
      throw new BadRequestException('businessUnitId 不能为空')
    }

    const row = await this.reqRepo.findOne({ where: { id } })
    if (!row) {
      throw new NotFoundException('需求不存在')
    }
    if (row.submitterId !== actor.id) {
      throw new ForbiddenException(
        '问题：无法修正板块。原因：你不是该需求的提交者。下一步：仅创建人可修改。',
      )
    }
    if (row.status !== 'collecting') {
      throw new BadRequestException(
        '问题：无法修正板块。原因：仅在「对话收集中」允许人工指定板块。下一步：若需变更请联系管理员。',
      )
    }

    const enabled = await this.businessUnitsService.listEnabled()
    const unit = enabled.find((u) => u.id === trimmed)
    if (!unit) {
      throw new BadRequestException(
        '问题：板块无效。原因：所选板块不存在或未启用。下一步：请从列表重新选择。',
      )
    }

    const merged = await this.getLatestSnapshotFields(id)
    if (!isCollectedCoreComplete(merged)) {
      throw new BadRequestException(
        '问题：信息尚不完整。原因：需先通过对话补全目标/范围/成功标准。下一步：继续与 AI 对话。',
      )
    }

    const summary = buildCollectedSummary(merged)
    let scoreResult: { score: number; rationale: string }
    try {
      scoreResult = await this.llm.scoreIntake(
        {
          summary,
          unitName: unit.name,
          admissionCriteria: unit.admissionCriteria,
        },
        { timeoutMs: getLlmAdmissionScoreTimeoutMs() },
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new ServiceUnavailableException(
        `问题：无法完成准入重算。原因：${msg}。下一步：请稍后重试。`,
      )
    }

    const now = new Date()
    await this.reqRepo.update(id, {
      businessUnitId: unit.id,
      projectIds: row.projectIds ?? [],
      admissionScore: scoreResult.score,
      admissionRationale: scoreResult.rationale,
      updatedAt: now,
    })

    await this.auditService.record({
      action: 'requirement_intake_manual_unit',
      actor: actor.id,
      target: id,
      requestId,
      occurredAt: toIso(now),
      before: {
        businessUnitId: row.businessUnitId,
        admissionScore: row.admissionScore,
      },
      after: { businessUnitId: unit.id, admissionScore: scoreResult.score },
      success: true,
    })

    if (scoreResult.score >= unit.admissionThreshold) {
      await this.applyCollectingToReceived(id, row, unit, actor, requestId, 'manual_patch')
    } else {
      await this.auditService.record({
        action: 'requirement_intake_below_threshold',
        actor: actor.id,
        target: id,
        requestId,
        occurredAt: toIso(now),
        before: null,
        after: { score: scoreResult.score, threshold: unit.admissionThreshold },
        success: true,
      })
    }

    return this.getById(id, actor, requestId)
  }

  async create(actor: RequestWithActor['actor'], requestId: string) {
    this.assertBusinessActor(actor)
    if (!actor) throw new ForbiddenException('未授权')

    const id = randomUUID()
    const now = new Date()
    const title = '新需求草稿'

    await this.reqRepo.save({
      id,
      title,
      status: 'collecting',
      submitterId: actor.id,
      businessUnitId: null,
      projectIds: [],
      admissionScore: null,
      admissionRationale: null,
      deliveryManagerId: null,
      createdAt: now,
      updatedAt: now,
    })

    const greeting =
      '你好！请描述你的需求，我会帮你整理并完成接待。你可以直接说明业务背景、要做什么、以及怎样算成功。'
    const aiMsg = await this.msgRepo.save({
      id: randomUUID(),
      requirementId: id,
      role: 'ai',
      content: greeting,
      createdAt: now,
    })

    await this.auditService.record({
      action: 'requirement_create',
      actor: actor.id,
      target: id,
      requestId,
      occurredAt: toIso(now),
      before: null,
      after: { id, title, submitterId: actor.id },
      success: true,
    })

    await this.auditService.record({
      action: 'requirement_message',
      actor: actor.id,
      target: `${id}:${aiMsg.id}`,
      requestId,
      occurredAt: toIso(now),
      before: null,
      after: { role: 'ai', content: greeting },
      success: true,
    })

    return this.getById(id, actor, requestId)
  }

  async getById(id: string, actor: RequestWithActor['actor'], requestId: string) {
    void requestId
    const row = await this.assertCanReadRequirement(id, actor)
    const latest = await this.getLatestSnapshotFields(id)
    return this.mapRequirement(row, latest)
  }

  async listMessages(
    id: string,
    actor: RequestWithActor['actor'],
    requestId: string,
    limit = 500,
  ) {
    void requestId
    await this.assertCanReadRequirement(id, actor)
    const rows = await this.msgRepo.find({
      where: { requirementId: id },
      order: { createdAt: 'ASC' },
      take: Math.min(Math.max(limit, 1), 2000),
    })
    return rows.map(mapMessage)
  }

  async listFieldSnapshots(id: string, actor: RequestWithActor['actor'], requestId: string) {
    void requestId
    await this.assertCanReadRequirement(id, actor)
    const rows = await this.snapRepo.find({
      where: { requirementId: id },
      order: { version: 'ASC' },
    })
    return rows.map((r) => ({
      id: r.id,
      requirementId: r.requirementId,
      version: r.version,
      collectedFields: r.collectedFields as CollectedFields,
      createdAt: toIso(r.createdAt),
    }))
  }

  async appendMessage(
    id: string,
    content: string,
    actor: RequestWithActor['actor'],
    requestId: string,
  ) {
    this.assertBusinessActor(actor)
    if (!actor) throw new ForbiddenException('未授权')

    const reqRow = await this.reqRepo.findOne({ where: { id } })
    if (!reqRow) {
      throw new NotFoundException('需求不存在')
    }
    if (reqRow.submitterId !== actor.id) {
      throw new ForbiddenException(
        '问题：无法在该会话中发送消息。原因：你不是该需求的提交者。下一步：请从「发起需求」新建会话。',
      )
    }

    if (reqRow.status === REQUIREMENT_STATUSES.ABANDONED) {
      throw new BadRequestException(
        '问题：该需求已放弃。原因：业务方已确认不再推进本次需求。下一步：可在需求列表查看历史记录，或重新发起新需求。',
      )
    }
    if (reqRow.status !== REQUIREMENT_STATUSES.COLLECTING) {
      throw new BadRequestException(
        '问题：对话接待已结束。原因：该需求状态已不是「对话收集中」（例如已接待）。下一步：请在需求列表查看后续流程，或联系交付经理。',
      )
    }

    const trimmed = content.trim()
    if (!trimmed) {
      throw new BadRequestException('消息内容不能为空')
    }

    const now = new Date()
    const userMsg = await this.msgRepo.save({
      id: randomUUID(),
      requirementId: id,
      role: 'user',
      content: trimmed,
      createdAt: now,
    })

    await this.auditService.record({
      action: 'requirement_message',
      actor: actor.id,
      target: `${id}:${userMsg.id}`,
      requestId,
      occurredAt: toIso(now),
      before: null,
      after: { role: 'user', content: trimmed },
      success: true,
    })

    const history = await this.msgRepo.find({
      where: { requirementId: id },
      order: { createdAt: 'ASC' },
    })
    const llmMessages: LlmChatTurn[] = history.map((m) => ({
      role: m.role === 'ai' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
      content: m.content,
    }))

    const completionTimeoutMs = getLlmCompletionTimeoutMs()
    try {
      const result = await this.llm.complete(llmMessages, { timeoutMs: completionTimeoutMs })
      const prevFields = await this.getLatestSnapshotFields(id)
      const merged = mergeCollected(prevFields, result.collectedFieldsPatch)

      let assistantText = result.assistantText
      if (isCollectedCoreComplete(merged)) {
        const intake = await this.evaluateIntakeAndPersist(
          id,
          reqRow,
          merged,
          result.intakeSuggestion,
          assistantText,
          actor,
          requestId,
        )
        assistantText = intake.finalAssistantText
      }

      const aiNow = new Date()
      const aiRow = await this.msgRepo.save({
        id: randomUUID(),
        requirementId: id,
        role: 'ai',
        content: assistantText,
        createdAt: aiNow,
      })

      await this.auditService.record({
        action: 'requirement_message',
        actor: actor.id,
        target: `${id}:${aiRow.id}`,
        requestId,
        occurredAt: toIso(aiNow),
        before: null,
        after: { role: 'ai', content: assistantText },
        success: true,
      })

      const nextVersion = await this.nextSnapshotVersion(id)

      await this.snapRepo.save({
        id: randomUUID(),
        requirementId: id,
        version: nextVersion,
        collectedFields: merged as Record<string, unknown>,
        createdAt: aiNow,
      })

      await this.auditService.record({
        action: 'requirement_field_snapshot',
        actor: actor.id,
        target: `${id}:v${nextVersion}`,
        requestId,
        occurredAt: toIso(aiNow),
        before: prevFields,
        after: merged,
        success: true,
      })

      const freshRow = await this.reqRepo.findOne({ where: { id } })
      const titleRow = freshRow ?? reqRow
      const nextTitle =
        titleRow.title === '新需求草稿' || !titleRow.title.trim()
          ? trimmed.slice(0, 80) + (trimmed.length > 80 ? '…' : '')
          : titleRow.title

      await this.reqRepo.update(id, { title: nextTitle, updatedAt: aiNow })

      return {
        userMessage: mapMessage(userMsg),
        aiMessage: mapMessage(aiRow),
        collectedFields: merged,
      }
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : ''
      const isAbort = name === 'AbortError'
      const msg = err instanceof Error ? err.message : String(err)

      await this.auditService.record({
        action: 'requirement_llm_failed',
        actor: actor.id,
        target: id,
        requestId,
        occurredAt: new Date().toISOString(),
        before: null,
        after: { error: msg, isAbort },
        success: false,
        reasonCode: isAbort ? 'llm_timeout' : 'llm_error',
      })

      if (isAbort) {
        const sec = Math.round(completionTimeoutMs / 1000)
        throw new GatewayTimeoutException(
          `问题：AI 暂时无法完成回复。原因：调用语言模型超时（超过 ${sec} 秒，可由环境变量 LLM_COMPLETION_TIMEOUT_MS 调整）。下一步：请稍后重试发送；若多次失败请联系管理员检查模型服务或网络。`,
        )
      }
      throw new ServiceUnavailableException(
        `问题：AI 暂时无法完成回复。原因：${msg}。下一步：请稍后重试；若持续失败请联系管理员检查 LLM_API_URL / LLM_API_KEY 等配置。`,
      )
    }
  }

  /**
   * 单点封装 collecting → received；后续可抽出为独立状态机服务，避免多处散落 update status。
   */
  private async applyCollectingToReceived(
    requirementId: string,
    previous: RequirementEntity,
    unit: BizUnit,
    actor: { id: string },
    requestId: string,
    source: 'llm_intake' | 'manual_patch',
  ): Promise<void> {
    const now = new Date()
    await this.reqRepo.update(requirementId, {
      status: 'received',
      deliveryManagerId: unit.deliveryManagerId,
      updatedAt: now,
    })

    await this.auditService.record({
      action: 'requirement_status_change',
      actor: actor.id,
      target: requirementId,
      requestId,
      occurredAt: toIso(now),
      before: { status: previous.status },
      after: { status: 'received', deliveryManagerId: unit.deliveryManagerId, source },
      success: true,
    })
  }

  /**
   * 单点封装 collecting → abandoned (Story 2.3 Task 1/3)。
   *
   * - 原子状态迁移：条件 UPDATE (`WHERE status='collecting'`)，并发双提交只会命中一次。
   * - 历史消息、字段快照不删除，满足 AC2 可追溯。
   * - 通知闭环（AC4/AC5 / NFR-07）通过 `scheduleAbandonNotification` **异步**发起（fire-and-forget）：
   *   - 不阻塞 HTTP 响应；NotificationsService 内部处理重试 + 降级 + 审计
   *   - 出现不可预期异常时由此兜底写审计，主流程不受影响
   *
   * 返回值：`true` 表示本次确实执行了迁移；`false` 表示并发情况下未命中条件（已被其他调用处理），
   * 调用方可据此决定是否跳过后续副作用。
   */
  private async applyCollectingToAbandoned(
    requirementId: string,
    previous: RequirementEntity,
    actor: { id: string },
    requestId: string,
    reason = '用户主动放弃',
  ): Promise<boolean> {
    const now = new Date()
    const occurredAtIso = toIso(now)

    // 条件 UPDATE：借助数据库保证只有一次迁移成功（M5 防并发）。
    const updateResult = await this.reqRepo.update(
      { id: requirementId, status: REQUIREMENT_STATUSES.COLLECTING },
      { status: REQUIREMENT_STATUSES.ABANDONED, updatedAt: now },
    )
    const affected =
      typeof updateResult.affected === 'number' ? updateResult.affected : Number(updateResult.affected ?? 0)
    if (affected < 1) {
      return false
    }

    await this.auditService.record({
      action: 'requirement_status_change',
      actor: actor.id,
      target: requirementId,
      requestId,
      occurredAt: occurredAtIso,
      before: { status: previous.status },
      after: { status: REQUIREMENT_STATUSES.ABANDONED, reason },
      success: true,
    })

    // H1 修复：异步解耦 —— 不 await，避免让 HTTP 响应被重试/退避阻塞到 15+s。
    this.scheduleAbandonNotification({
      requirementId,
      requirementTitle: previous.title,
      reason,
      recipientId: previous.submitterId,
      actor: actor.id,
      requestId,
      occurredAt: occurredAtIso,
    })

    return true
  }

  /**
   * 以 fire-and-forget 方式调度放弃通知。
   * 注意：
   * - NotificationsService 设计上不抛（重试与降级内部处理）；此处 catch 仅兜底不可预期异常。
   * - 不返回 Promise，调用方无法 await，确保"异步解耦"承诺不被破坏。
   * - 通过 `notificationsService.track()` 注册在飞 Promise，供 `onApplicationShutdown` 排空。
   * - 子类可覆盖以接入事件总线 / 队列实现（当前实现足以满足 NFR-07 解耦语义）。
   *
   * HIGH-3：`mentionedWecomUserIds` 目前为空数组（尚无 <内部 userId → 企微 userid> 映射表），
   *         NotificationsService 会在审计中显式标记 `recipientTargeting: 'group_broadcast'`。
   */
  protected scheduleAbandonNotification(input: {
    requirementId: string
    requirementTitle: string
    reason: string
    recipientId: string
    actor: string
    requestId: string
    occurredAt: string
  }): void {
    const task = Promise.resolve()
      .then(() =>
        this.notificationsService.notifyRequirementAbandoned({
          ...input,
          mentionedWecomUserIds: [],
        }),
      )
      .catch(async (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        // MEDIUM-5：通知编排器本身崩溃属于系统级异常，必须落日志 + 审计，不得静默
        this.logger.error(
          `[notify] orchestrator unexpected failure requirement=${input.requirementId} request=${input.requestId} err=${msg}`,
        )
        try {
          await this.auditService.record({
            action: 'requirement_abandoned',
            actor: input.actor,
            target: input.requirementId,
            requestId: input.requestId,
            occurredAt: input.occurredAt,
            before: null,
            after: { unexpectedError: msg, attemptedAt: new Date().toISOString() },
            success: false,
            reasonCode: 'notification_orchestrator_unexpected',
          })
        } catch (auditErr: unknown) {
          const auditMsg = auditErr instanceof Error ? auditErr.message : String(auditErr)
          this.logger.error(
            `[notify] audit record itself failed requirement=${input.requirementId} err=${auditMsg}`,
          )
        }
      })
    void this.notificationsService.track(task)
  }

  /** 放弃原因的最大长度（写入审计 after_data；超过则拒绝，防止放大攻击）。 */
  private static readonly ABANDON_REASON_MAX_LENGTH = 500

  /**
   * 规范化并校验可选的放弃原因（Story 2.3 code-review HIGH-3）。
   * - 非字符串 → 400（避免未定义 toString 行为污染审计）
   * - 超长 → 400（阻断写入 audit 的放大攻击面）
   * - 空/全空白 → 降级为默认文案
   */
  private normalizeAbandonReason(raw: unknown): string {
    if (raw === undefined || raw === null) return '用户主动放弃'
    if (typeof raw !== 'string') {
      throw new BadRequestException(
        '问题：放弃原因格式不正确。原因：reason 字段必须为字符串。下一步：请以字符串形式提交原因或留空。',
      )
    }
    const trimmed = raw.trim()
    if (!trimmed) return '用户主动放弃'
    if (trimmed.length > RequirementsService.ABANDON_REASON_MAX_LENGTH) {
      throw new BadRequestException(
        `问题：放弃原因过长。原因：单条原因不得超过 ${RequirementsService.ABANDON_REASON_MAX_LENGTH} 字符。下一步：请精简后重试。`,
      )
    }
    return trimmed
  }

  /**
   * 公开单点放弃方法 (Story 2.3 Task 1, hardened in code review)。
   * 控制器应调用此方法而非直接 update status。
   * 满足 AC1-3,6: 权限、状态守卫、审计、可追溯、错误信封。
   * AC4/5 通知闭环由 NotificationsService 异步发起（fire-and-forget）。
   */
  async abandonRequirement(
    id: string,
    actor: RequestWithActor['actor'],
    requestId: string,
    reason?: unknown,
  ) {
    this.assertBusinessActor(actor)
    if (!actor) throw new ForbiddenException('未授权')

    const normalizedReason = this.normalizeAbandonReason(reason)

    const row = await this.reqRepo.findOne({ where: { id } })
    if (!row) {
      throw new NotFoundException('需求不存在')
    }
    if (row.submitterId !== actor.id) {
      throw new ForbiddenException(
        '问题：无法放弃需求。原因：仅该需求的提交者本人可执行放弃操作。下一步：请使用提交者账号登录。',
      )
    }
    if (row.status !== REQUIREMENT_STATUSES.COLLECTING) {
      throw new BadRequestException(
        '问题：无法放弃需求。原因：仅在「对话收集中」阶段允许放弃操作。下一步：请在需求列表查看当前状态或联系交付经理。',
      )
    }

    const migrated = await this.applyCollectingToAbandoned(
      id,
      row,
      actor,
      requestId,
      normalizedReason,
    )
    if (!migrated) {
      // 并发/幂等：另一请求已完成迁移；重新读取并原样返回当前状态，不再重复副作用。
      await this.auditService.record({
        action: 'requirement_status_change',
        actor: actor.id,
        target: id,
        requestId,
        occurredAt: new Date().toISOString(),
        before: { status: row.status },
        after: { status: REQUIREMENT_STATUSES.ABANDONED, reason: normalizedReason },
        success: false,
        reasonCode: 'abandon_concurrent_no_op',
      })
    }

    return this.getById(id, actor, requestId)
  }

  private async evaluateIntakeAndPersist(
    requirementId: string,
    reqRow: RequirementEntity,
    merged: CollectedFields,
    intakeSuggestion: IntakeSuggestion | undefined,
    baseAssistantText: string,
    actor: { id: string },
    requestId: string,
  ): Promise<{ finalAssistantText: string; transitioned: boolean }> {
    const enabled = await this.businessUnitsService.listEnabled()
    const enabledIds = new Set(enabled.map((u) => u.id))

    const fromMerged = merged.suggestedBusinessUnitId?.trim()
    const fromIntake = intakeSuggestion?.suggestedBusinessUnitId?.trim()
    let chosenId = fromIntake || fromMerged || ''
    if (chosenId && !enabledIds.has(chosenId)) {
      chosenId = ''
    }

    const projectIds = Array.isArray(intakeSuggestion?.projectIds)
      ? intakeSuggestion!.projectIds!.filter((x) => typeof x === 'string' && x.trim() !== '')
      : []

    const now = new Date()

    if (!chosenId) {
      await this.reqRepo.update(requirementId, {
        businessUnitId: null,
        projectIds,
        admissionScore: null,
        admissionRationale:
          '未能关联到启用状态的业务板块（模型建议无效或未给出）。请使用界面选择拟归属板块。',
        updatedAt: now,
      })
      await this.auditService.record({
        action: 'requirement_intake_assessed',
        actor: actor.id,
        target: requirementId,
        requestId,
        occurredAt: toIso(now),
        before: null,
        after: { businessUnitId: null, reason: 'no_valid_unit' },
        success: true,
      })
      return {
        finalAssistantText: `${baseAssistantText}\n\n---\n问题：尚未锁定有效的业务板块。原因：自动识别未给出可用板块 ID，或建议的板块未启用。\n下一步：请在页面上从「启用板块」列表中选择最接近的一项并保存；或继续补充背景信息以便重新识别。`,
        transitioned: false,
      }
    }

    const unit = enabled.find((u) => u.id === chosenId)
    if (!unit) {
      await this.reqRepo.update(requirementId, {
        businessUnitId: null,
        projectIds,
        admissionScore: null,
        admissionRationale: '内部错误：板块数据不一致。',
        updatedAt: now,
      })
      return { finalAssistantText: baseAssistantText, transitioned: false }
    }

    let score = intakeSuggestion?.admissionScore
    let rationale = intakeSuggestion?.admissionRationale?.trim()

    const scoreLooksValid =
      typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100

    if (!scoreLooksValid) {
      try {
        const scored = await this.llm.scoreIntake(
          {
            summary: buildCollectedSummary(merged),
            unitName: unit.name,
            admissionCriteria: unit.admissionCriteria,
          },
          { timeoutMs: getLlmAdmissionScoreTimeoutMs() },
        )
        score = scored.score
        rationale = scored.rationale
      } catch {
        score = 0
        rationale = '无法完成自动打分，请使用「修正板块」重试或联系管理员。'
      }
    } else {
      score = Math.round(score as number)
    }

    await this.reqRepo.update(requirementId, {
      businessUnitId: unit.id,
      projectIds,
      admissionScore: score,
      admissionRationale: rationale ?? null,
      updatedAt: now,
    })

    await this.auditService.record({
      action: 'requirement_intake_assessed',
      actor: actor.id,
      target: requirementId,
      requestId,
      occurredAt: toIso(now),
      before: null,
      after: {
        businessUnitId: unit.id,
        admissionScore: score,
        threshold: unit.admissionThreshold,
      },
      success: true,
    })

    if (score < unit.admissionThreshold) {
      const critShort =
        unit.admissionCriteria.length > 200
          ? `${unit.admissionCriteria.slice(0, 200)}…`
          : unit.admissionCriteria
      return {
        finalAssistantText: `${baseAssistantText}\n\n---\n问题：当前信息与板块「${unit.name}」的准入要求尚有差距。\n原因：匹配度为 ${score}，低于所需阈值 ${unit.admissionThreshold}（板块标准摘要：${critShort}）。\n下一步：请按上述标准补充关键信息，或使用页面上的板块修正功能重新选择后再试。`,
        transitioned: false,
      }
    }

    await this.applyCollectingToReceived(requirementId, reqRow, unit, actor, requestId, 'llm_intake')
    return {
      finalAssistantText: `${baseAssistantText}\n\n---\n需求已达到板块「${unit.name}」的准入标准（匹配度 ${score} ≥ ${unit.admissionThreshold}），状态已更新为「已接待」。`,
      transitioned: true,
    }
  }

  /**
   * 读权限：业务方仅本人草稿；`admin` / `delivery_manager` 可按需求 ID 追溯消息与快照（AC4）。
   * 写权限仍仅限业务方（AC5）。
   */
  private async assertCanReadRequirement(
    id: string,
    actor: RequestWithActor['actor'],
  ): Promise<RequirementEntity> {
    if (!actor) {
      throw new ForbiddenException('未授权')
    }

    if (actor.role === 'admin' || actor.role === 'delivery_manager') {
      const row = await this.reqRepo.findOne({ where: { id } })
      if (!row) {
        throw new NotFoundException('需求不存在')
      }
      return row
    }

    if (actor.role !== 'business') {
      throw new ForbiddenException(
        '问题：无法查看该需求。原因：接待读接口仅向业务方或管理员/交付经理开放。下一步：请使用具备权限的账号登录。',
      )
    }

    const row = await this.reqRepo.findOne({ where: { id } })
    if (!row) {
      throw new NotFoundException('需求不存在')
    }
    if (row.submitterId !== actor.id) {
      throw new ForbiddenException(
        '问题：无法查看该需求。原因：业务方仅可访问本人创建的需求草稿。下一步：从「发起需求」进入自己的会话。',
      )
    }
    return row
  }

  private async nextSnapshotVersion(requirementId: string): Promise<number> {
    const raw = await this.snapRepo
      .createQueryBuilder('s')
      .select('MAX(s.version)', 'maxv')
      .where('s.requirementId = :rid', { rid: requirementId })
      .getRawOne<{ maxv: string | number | null }>()
    const v = raw?.maxv != null ? Number(raw.maxv) : 0
    return v + 1
  }

  private async getLatestSnapshotFields(requirementId: string): Promise<CollectedFields> {
    const row = await this.snapRepo.findOne({
      where: { requirementId },
      order: { version: 'DESC' },
    })
    if (!row) return emptyCollected()
    return row.collectedFields as CollectedFields
  }

  private mapRequirement(row: RequirementEntity, collected: CollectedFields) {
    const pids = Array.isArray(row.projectIds) ? row.projectIds : []
    const assessment = {
      businessUnitId: row.businessUnitId ?? null,
      projectIds: pids,
      admissionScore: row.admissionScore ?? null,
      admissionRationale: row.admissionRationale ?? undefined,
    }
    return {
      id: row.id,
      title: row.title,
      description: '',
      status: row.status as RequirementStatus,
      projectIds: pids,
      submitterId: row.submitterId,
      deliveryManagerId: row.deliveryManagerId ?? undefined,
      collectedFields: collected,
      admissionAssessment: assessment,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    }
  }
}
