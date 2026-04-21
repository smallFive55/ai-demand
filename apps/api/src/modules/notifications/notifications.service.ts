import { randomUUID } from 'crypto'
import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common'
import { AuditService } from '../audit/audit.service'
import {
  NOTIFICATION_EVENTS,
  type NotificationDispatchResult,
  type NotificationRecipientTargeting,
  type RequirementDeepLinkParams,
  type WecomRequirementAbandonedPayload,
} from './notifications.types'
import { sanitizeErrorMessage } from './url-redact'
import { WECOM_NOTIFIER, type WecomNotifierPort } from './wecom-notifier.port'

/**
 * 通知编排服务（Story 2.3 Task 3）。
 *
 * 能力：
 *  - 企业微信放弃通知：带深链参数（requirementId / step / actionId / source）
 *  - 失败重试（指数退避，最大次数可配）
 *  - 超过阈值后降级为站内信/待办记录（当前阶段统一以 AuditService 记录 notification_fallback 事件，
 *    由前端"待办 / 消息中心"读取；后续若引入独立 inbox 表可替换此实现）
 *  - 所有链路节点写审计（dispatch_started / 每次重试 / 最终成功或降级）
 *  - `onApplicationShutdown`：等待在飞通知排空（最长 `NOTIFICATION_SHUTDOWN_GRACE_MS`，默认 5s），
 *    降低进程优雅重启时丢失通知的概率。
 *
 * NFR-07：异步解耦 + 重试 + 降级 + 可观测性。
 *
 * ⚠️ 架构偏离（HIGH-2）：`architecture.md` 约定 "API -> Redis Queue -> Worker" 的跨进程
 * 工作队列。当前实现为进程内 fire-and-forget + 审计 outbox 语义（`dispatch_started` 审计行
 * 即重放凭据），暂不具备跨进程持久化。真正引入 BullMQ/Redis Queue 属 Story 2.4 范围，
 * 届时本服务转为 Producer，Worker 消费持久化任务并仍使用审计作为观测面。
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
    const normalizedMentions = (input.mentionedWecomUserIds ?? []).filter(
      (s): s is string => typeof s === 'string' && s.trim().length > 0,
    )
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

    // HIGH-2：outbox 语义 — 在尝试发送之前先落审计，确保即使进程崩溃也留有重放凭据
    await this.auditService.record({
      action: 'requirement_abandoned',
      actor: input.actor,
      target: input.requirementId,
      requestId: input.requestId,
      occurredAt: input.occurredAt,
      before: null,
      after: {
        eventName: payload.eventName,
        channel: 'wecom',
        phase: 'dispatch_started',
        deepLinkParams,
        recipientTargeting: targeting,
        mentionedCount: normalizedMentions.length,
        attemptedAt: new Date().toISOString(),
      },
      success: true,
      reasonCode: 'notification_dispatch_started',
    })

    if (targeting === 'group_broadcast' && process.env.WECOM_WEBHOOK_URL?.trim()) {
      this.logger.warn(
        `[notify] group_broadcast mode used for requirement=${input.requirementId} (no mentionedWecomUserIds); ` +
          'pending user→wecom userid mapping (follow-up story).',
      )
    }

    const maxAttempts = this.getMaxAttempts()
    const baseBackoff = this.getBaseBackoffMs()

    let lastError: string | undefined
    let externalMessageId: string | undefined

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const attemptedAt = new Date().toISOString()
      try {
        const res = await this.wecom.sendRequirementAbandoned(payload)
        externalMessageId = res.externalMessageId

        // H5：audit.occurredAt 固定为业务事件发生时刻 (input.occurredAt)，
        //     实际尝试时间用 `attemptedAt` 暴露在 after 里，保持时序回放可一致。
        await this.auditService.record({
          action: 'requirement_abandoned',
          actor: input.actor,
          target: input.requirementId,
          requestId: input.requestId,
          occurredAt: input.occurredAt,
          before: null,
          after: {
            eventName: payload.eventName,
            channel: 'wecom',
            attempt,
            attemptedAt,
            deepLinkParams,
            recipientTargeting: targeting,
            externalMessageId: externalMessageId ?? null,
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
        // MEDIUM-4：防止 Webhook URL（含 ?key=xxx 凭证）被错误消息拼出去落审计/日志
        lastError = sanitizeErrorMessage(rawMsg)
        this.logger.warn(
          `[notify] wecom attempt=${attempt}/${maxAttempts} failed requirement=${input.requirementId} err=${lastError}`,
        )
        await this.auditService.record({
          action: 'requirement_abandoned',
          actor: input.actor,
          target: input.requirementId,
          requestId: input.requestId,
          occurredAt: input.occurredAt,
          before: null,
          after: {
            eventName: payload.eventName,
            channel: 'wecom',
            attempt,
            attemptedAt,
            deepLinkParams,
            recipientTargeting: targeting,
            error: lastError,
          },
          success: false,
          reasonCode: 'wecom_dispatch_failed',
        })

        if (attempt < maxAttempts) {
          await this.delay(this.computeBackoff(attempt, baseBackoff))
        }
      }
    }

    // 重试耗尽 → 降级：写入 notification_fallback 语义事件，等待前端站内信/待办读取
    await this.auditService.record({
      action: 'requirement_abandoned',
      actor: input.actor,
      target: input.requirementId,
      requestId: input.requestId,
      occurredAt: input.occurredAt,
      before: null,
      after: {
        eventName: payload.eventName,
        channel: 'in-app-todo',
        fallback: true,
        attemptedAt: new Date().toISOString(),
        deepLinkParams,
        recipientTargeting: targeting,
        lastError,
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
    return baseMs * Math.pow(2, attempt - 1)
  }

  private delay(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve()
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
