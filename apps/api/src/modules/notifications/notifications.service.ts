import { randomUUID } from 'crypto'
import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common'
import { AuditService, type AuditEvent } from '../audit/audit.service'
import {
  NOTIFICATION_EVENTS,
  type NotificationDispatchResult,
  type NotificationEventName,
  type NotificationRecipientTargeting,
  type RequirementDeepLinkParams,
  type WecomRequirementAbandonedPayload,
  type WecomRequirementReceivedPayload,
} from './notifications.types'
import { normalizeMentions, sanitizeErrorMessage } from './url-redact'
import { WECOM_NOTIFIER, type WecomNotifierPort } from './wecom-notifier.port'

/**
 * 通知编排服务（Story 2.3 Task 3 建立；Story 2.4 扩展接待成功场景）。
 *
 * 能力：
 *  - 企业微信通知：
 *      - 放弃事件（Story 2.3）：`requirement.status.abandoned.v1`（step=abandon，role=business）
 *      - 接待成功事件（Story 2.4）：`requirement.status.received.v1`（step=review，role=delivery-manager）
 *  - 失败重试（指数退避，最大次数可配）
 *  - 超过阈值后降级为站内信/待办记录（统一以 AuditService 记录 notification_fallback 事件）
 *  - 所有链路节点写审计（dispatch_started / 每次重试 / 最终成功或降级）
 *  - `onApplicationShutdown`：等待在飞通知排空（最长 `NOTIFICATION_SHUTDOWN_GRACE_MS`，默认 5s）
 *
 * NFR-07：异步解耦 + 重试 + 降级 + 可观测性。
 *
 * ⚠️ 架构偏离（Story 2.3 HIGH-2 / Story 2.4 继承）：`architecture.md` 约定
 * "API -> Redis Queue -> Worker" 的跨进程工作队列。当前实现为进程内 fire-and-forget
 * + 审计 outbox 语义（`dispatch_started` 审计行即重放凭据），暂不具备跨进程持久化。
 * BullMQ/Redis Queue 接入作为 follow-up story。
 */
@Injectable()
export class NotificationsService implements OnApplicationShutdown {
  private readonly logger = new Logger(NotificationsService.name)

  /** 进程内追踪在飞通知，便于 graceful shutdown 排空 */
  private readonly inflight = new Set<Promise<unknown>>()

  constructor(
    private readonly auditService: AuditService,
    @Inject(WECOM_NOTIFIER) private readonly wecom: WecomNotifierPort,
  ) {}

  private getMaxAttempts(): number {
    const raw = process.env.NOTIFICATION_MAX_ATTEMPTS?.trim()
    const n = raw ? parseInt(raw, 10) : NaN
    if (!Number.isFinite(n)) return 3
    return Math.min(Math.max(n, 1), 8)
  }

  /**
   * 指数退避基数（ms）。
   * MEDIUM-6：生产最小保护 10ms，避免在限流错误上零间隔狂轰；
   *           测试可通过 mock `delay` 或 `computeBackoff` 绕过。
   */
  private getBaseBackoffMs(): number {
    const raw = process.env.NOTIFICATION_BACKOFF_BASE_MS?.trim()
    const n = raw ? parseInt(raw, 10) : NaN
    if (!Number.isFinite(n)) return 200
    return Math.min(Math.max(n, 10), 5_000)
  }

  /** 优雅关闭时允许排空在飞通知的最长等待（ms） */
  private getShutdownGraceMs(): number {
    const raw = process.env.NOTIFICATION_SHUTDOWN_GRACE_MS?.trim()
    const n = raw ? parseInt(raw, 10) : NaN
    if (!Number.isFinite(n)) return 5_000
    return Math.min(Math.max(n, 0), 30_000)
  }

  /**
   * 入参最小集：requirementId / title / reason / recipientId / actor / requestId。
   * 返回调度结果便于调用方写汇总日志；失败不会向外抛错（保障业务主流程不阻塞）。
   *
   * HIGH-2：进入重试循环前先写 `dispatch_started` 审计行，形成 outbox 语义的"重放凭据"；
   *         进程崩溃重启后运维可以基于该行重放或人工通知，防止通知彻底丢失。
   * HIGH-3：`mentionedWecomUserIds` 未提供时走群广播模式并在审计 `recipientTargeting` 字段显式声明，
   *         便于运维过滤出"未定向投递"的通知并补发。
   */
  async notifyRequirementAbandoned(input: {
    requirementId: string
    requirementTitle: string
    reason: string
    recipientId: string
    actor: string
    requestId: string
    occurredAt: string
    mentionedWecomUserIds?: string[]
  }): Promise<NotificationDispatchResult> {
    const actionId = randomUUID()
    const deepLinkParams: RequirementDeepLinkParams = {
      requirementId: input.requirementId,
      step: 'abandon',
      actionId,
      source: 'wecom',
    }
    const normalizedMentions = normalizeMentions(input.mentionedWecomUserIds)
    const targeting: NotificationRecipientTargeting =
      normalizedMentions.length > 0 ? 'user_mentioned' : 'group_broadcast'
    const payload: WecomRequirementAbandonedPayload = {
      eventName: NOTIFICATION_EVENTS.REQUIREMENT_ABANDONED,
      recipientId: input.recipientId,
      requirementId: input.requirementId,
      requirementTitle: input.requirementTitle,
      reason: input.reason,
      occurredAt: input.occurredAt,
      deepLinkParams,
      mentionedWecomUserIds: normalizedMentions,
    }

    return this.dispatchWithRetryAndFallback({
      auditAction: 'requirement_abandoned',
      eventName: NOTIFICATION_EVENTS.REQUIREMENT_ABANDONED,
      input: {
        actor: input.actor,
        requestId: input.requestId,
        target: input.requirementId,
        occurredAt: input.occurredAt,
      },
      deepLinkParams,
      targeting,
      mentionedCount: normalizedMentions.length,
      send: () => this.wecom.sendRequirementAbandoned(payload),
    })
  }

  /**
   * Story 2.4：接待成功后通知交付经理。
   *
   * - `step=review`（架构契约 `/{role}/approvals`），交付经理通过深链进入过渡审批页。
   * - 严格复用 abandon 路径的"outbox dispatch_started → 重试循环 → 降级审计"骨架，
   *   通过私有 `dispatchWithRetryAndFallback` 抽象消除复制粘贴。
   * - 主流程（`applyCollectingToReceived`）以 fire-and-forget 方式调度，本方法对失败只
   *   体现在 `NotificationDispatchResult`，不抛错到调用方。
   */
  async notifyRequirementReceived(input: {
    requirementId: string
    requirementTitle: string
    submitterId: string
    businessUnitName: string
    admissionScore: number
    admissionThreshold: number
    source: 'llm_intake' | 'manual_patch'
    recipientId: string
    actor: string
    requestId: string
    occurredAt: string
    mentionedWecomUserIds?: string[]
  }): Promise<NotificationDispatchResult> {
    const actionId = randomUUID()
    const deepLinkParams: RequirementDeepLinkParams = {
      requirementId: input.requirementId,
      step: 'review',
      actionId,
      source: 'wecom',
    }
    const normalizedMentions = normalizeMentions(input.mentionedWecomUserIds)
    const targeting: NotificationRecipientTargeting =
      normalizedMentions.length > 0 ? 'user_mentioned' : 'group_broadcast'
    const payload: WecomRequirementReceivedPayload = {
      eventName: NOTIFICATION_EVENTS.REQUIREMENT_RECEIVED,
      recipientId: input.recipientId,
      requirementId: input.requirementId,
      requirementTitle: input.requirementTitle,
      submitterId: input.submitterId,
      businessUnitName: input.businessUnitName,
      admissionScore: input.admissionScore,
      admissionThreshold: input.admissionThreshold,
      source: input.source,
      occurredAt: input.occurredAt,
      deepLinkParams,
      mentionedWecomUserIds: normalizedMentions,
    }

    return this.dispatchWithRetryAndFallback({
      auditAction: 'requirement_received',
      eventName: NOTIFICATION_EVENTS.REQUIREMENT_RECEIVED,
      input: {
        actor: input.actor,
        requestId: input.requestId,
        target: input.requirementId,
        occurredAt: input.occurredAt,
      },
      deepLinkParams,
      targeting,
      mentionedCount: normalizedMentions.length,
      extraAfter: {
        source: input.source,
        admissionScore: input.admissionScore,
        admissionThreshold: input.admissionThreshold,
      },
      send: () => this.wecom.sendRequirementReceived(payload),
    })
  }

  /**
   * 共用的 "dispatch_started outbox → 重试循环 → 降级审计" 骨架。
   *
   * 抽取动机（Story 2.4）：避免 abandon 与 received 两条通知路径在审计字段顺序 /
   * reasonCode / attemptedAt 语义上漂移；新增事件类型只需传入发送 closure 与事件元数据。
   *
   * - 所有审计行 `occurredAt` 固定为业务时刻 `input.occurredAt`（H5 时序约定）；
   *   实际尝试时间以 `attemptedAt` 字段暴露在 after 里。
   * - 失败消息统一经 `sanitizeErrorMessage` 脱敏，防止 Webhook URL `?key=` 泄漏。
   */
  private async dispatchWithRetryAndFallback(args: {
    auditAction: AuditEvent['action']
    eventName: NotificationEventName
    input: {
      actor: string
      requestId: string
      target: string
      occurredAt: string
    }
    deepLinkParams: RequirementDeepLinkParams
    targeting: NotificationRecipientTargeting
    mentionedCount: number
    extraAfter?: Record<string, unknown>
    send: () => Promise<{ externalMessageId?: string }>
  }): Promise<NotificationDispatchResult> {
    const { auditAction, eventName, input, deepLinkParams, targeting, mentionedCount, extraAfter, send } =
      args

    await this.auditService.record({
      action: auditAction,
      actor: input.actor,
      target: input.target,
      requestId: input.requestId,
      occurredAt: input.occurredAt,
      before: null,
      after: {
        eventName,
        channel: 'wecom',
        phase: 'dispatch_started',
        deepLinkParams,
        recipientTargeting: targeting,
        mentionedCount,
        attemptedAt: new Date().toISOString(),
        ...(extraAfter ?? {}),
      },
      success: true,
      reasonCode: 'notification_dispatch_started',
    })

    if (targeting === 'group_broadcast' && process.env.WECOM_WEBHOOK_URL?.trim()) {
      this.logger.warn(
        `[notify] group_broadcast mode used for requirement=${input.target} event=${eventName} ` +
          '(no mentionedWecomUserIds); pending user→wecom userid mapping (follow-up story).',
      )
    }

    const maxAttempts = this.getMaxAttempts()
    const baseBackoff = this.getBaseBackoffMs()

    let lastError: string | undefined
    let externalMessageId: string | undefined

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const attemptedAt = new Date().toISOString()
      try {
        const res = await send()
        externalMessageId = res.externalMessageId

        await this.auditService.record({
          action: auditAction,
          actor: input.actor,
          target: input.target,
          requestId: input.requestId,
          occurredAt: input.occurredAt,
          before: null,
          after: {
            eventName,
            channel: 'wecom',
            attempt,
            attemptedAt,
            deepLinkParams,
            recipientTargeting: targeting,
            externalMessageId: externalMessageId ?? null,
            ...(extraAfter ?? {}),
          },
          success: true,
        })

        return {
          success: true,
          attempts: attempt,
          fallbackTriggered: false,
          externalMessageId,
        }
      } catch (err) {
        const rawMsg = err instanceof Error ? err.message : String(err)
        lastError = sanitizeErrorMessage(rawMsg)
        this.logger.warn(
          `[notify] wecom event=${eventName} attempt=${attempt}/${maxAttempts} failed requirement=${input.target} err=${lastError}`,
        )
        await this.auditService.record({
          action: auditAction,
          actor: input.actor,
          target: input.target,
          requestId: input.requestId,
          occurredAt: input.occurredAt,
          before: null,
          after: {
            eventName,
            channel: 'wecom',
            attempt,
            attemptedAt,
            deepLinkParams,
            recipientTargeting: targeting,
            error: lastError,
            ...(extraAfter ?? {}),
          },
          success: false,
          reasonCode: 'wecom_dispatch_failed',
        })

        if (attempt < maxAttempts) {
          await this.delay(this.computeBackoff(attempt, baseBackoff))
        }
      }
    }

    await this.auditService.record({
      action: auditAction,
      actor: input.actor,
      target: input.target,
      requestId: input.requestId,
      occurredAt: input.occurredAt,
      before: null,
      after: {
        eventName,
        channel: 'in-app-todo',
        fallback: true,
        attemptedAt: new Date().toISOString(),
        deepLinkParams,
        recipientTargeting: targeting,
        lastError,
        ...(extraAfter ?? {}),
      },
      success: true,
      reasonCode: 'wecom_fallback_in_app_todo',
    })

    return {
      success: false,
      attempts: maxAttempts,
      fallbackTriggered: true,
      lastError,
    }
  }

  /**
   * 将任意 Promise 注册为"在飞通知"，便于 onApplicationShutdown 排空。
   * 失败不抛（由内部的 notify 流程自行降级）。
   */
  track<T>(p: Promise<T>): Promise<T> {
    this.inflight.add(p)
    p.finally(() => this.inflight.delete(p))
    return p
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.inflight.size === 0) return
    const grace = this.getShutdownGraceMs()
    this.logger.log(
      `[notify] draining ${this.inflight.size} in-flight notification(s) with grace=${grace}ms`,
    )
    await Promise.race([
      Promise.allSettled([...this.inflight]),
      new Promise((resolve) => setTimeout(resolve, grace)),
    ])
    if (this.inflight.size > 0) {
      this.logger.warn(
        `[notify] shutdown grace elapsed, ${this.inflight.size} notification(s) may be retried from dispatch_started audit`,
      )
    }
  }

  /** 指数退避；允许 baseMs 在运行期被测试替身注入为 0 以加速（生产端 getBaseBackoffMs 已 clamp ≥10ms） */
  private computeBackoff(attempt: number, baseMs: number): number {
    if (baseMs <= 0) return 0
    return Math.min(baseMs * Math.pow(2, attempt - 1), 5_000)
  }

  private delay(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve()
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
