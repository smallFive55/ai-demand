import type { CollectedFields, RequirementStatus } from '@ai-demand/contracts'
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
import { LLM_CHAT, LlmChatPort, type LlmChatTurn } from './llm/llm-chat.port'

/** 单轮 AI 调用硬上限（与 UX 10s 对齐）；生产环境 P95 需在 APM/日志中单独度量 */
const AI_ROUND_TIMEOUT_MS = 10_000

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
    @Inject(LLM_CHAT) private readonly llm: LlmChatPort,
  ) {}

  assertBusinessActor(actor: RequestWithActor['actor']): void {
    if (!actor || actor.role !== 'business') {
      throw new ForbiddenException(
        '问题：无法提交需求。原因：当前账号不是业务方角色。下一步：请使用业务方账号登录后再试。',
      )
    }
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

    try {
      const result = await this.llm.complete(llmMessages, { timeoutMs: AI_ROUND_TIMEOUT_MS })
      const aiNow = new Date()
      const aiRow = await this.msgRepo.save({
        id: randomUUID(),
        requirementId: id,
        role: 'ai',
        content: result.assistantText,
        createdAt: aiNow,
      })

      await this.auditService.record({
        action: 'requirement_message',
        actor: actor.id,
        target: `${id}:${aiRow.id}`,
        requestId,
        occurredAt: toIso(aiNow),
        before: null,
        after: { role: 'ai', content: result.assistantText },
        success: true,
      })

      const prevFields = await this.getLatestSnapshotFields(id)
      const merged = mergeCollected(prevFields, result.collectedFieldsPatch)
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

      const nextTitle =
        reqRow.title === '新需求草稿' || !reqRow.title.trim()
          ? trimmed.slice(0, 80) + (trimmed.length > 80 ? '…' : '')
          : reqRow.title

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
        throw new GatewayTimeoutException(
          '问题：AI 暂时无法完成回复。原因：调用语言模型超时（超过 10 秒）。下一步：请稍后重试发送；若多次失败请联系管理员检查模型服务或网络。',
        )
      }
      throw new ServiceUnavailableException(
        `问题：AI 暂时无法完成回复。原因：${msg}。下一步：请稍后重试；若持续失败请联系管理员检查 LLM_API_URL / LLM_API_KEY 等配置。`,
      )
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
    return {
      id: row.id,
      title: row.title,
      description: '',
      status: row.status as RequirementStatus,
      projectIds: [] as string[],
      submitterId: row.submitterId,
      collectedFields: collected,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    }
  }
}
