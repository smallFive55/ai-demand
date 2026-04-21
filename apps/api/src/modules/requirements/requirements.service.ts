import type { CollectedFields, EnabledBusinessUnitSummary, RequirementStatus } from '@ai-demand/contracts'
import {
  BadRequestException,
  ForbiddenException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'crypto'
import { Repository } from 'typeorm'
import { RequirementFieldSnapshotEntity } from '../../database/entities/requirement-field-snapshot.entity'
import { RequirementMessageEntity } from '../../database/entities/requirement-message.entity'
import { RequirementEntity } from '../../database/entities/requirement.entity'
import type { RequestWithActor } from '../../common/guards/admin-auth.guard'
import { AuditService } from '../audit/audit.service'
import { BusinessUnitsService } from '../admin/business-units/business-units.service'
import type { BizUnit } from '../admin/business-units/business-units.types'
import { LLM_CHAT, LlmChatPort, type IntakeSuggestion, type LlmChatTurn } from './llm/llm-chat.port'

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
  constructor(
    @InjectRepository(RequirementEntity)
    private readonly reqRepo: Repository<RequirementEntity>,
    @InjectRepository(RequirementMessageEntity)
    private readonly msgRepo: Repository<RequirementMessageEntity>,
    @InjectRepository(RequirementFieldSnapshotEntity)
    private readonly snapRepo: Repository<RequirementFieldSnapshotEntity>,
    private readonly auditService: AuditService,
    private readonly businessUnitsService: BusinessUnitsService,
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

    if (reqRow.status !== 'collecting') {
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
