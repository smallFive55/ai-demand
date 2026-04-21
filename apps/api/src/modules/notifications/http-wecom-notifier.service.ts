import { Injectable, Logger } from '@nestjs/common'
import type { WecomNotifierPort } from './wecom-notifier.port'
import type { WecomRequirementAbandonedPayload } from './notifications.types'
import { redactWebhookUrl } from './url-redact'

/**
 * 企业微信群机器人 / 自建应用消息发送器（Story 2.3 Task 3）。
 *
 * 启用条件：
 *  - WECOM_WEBHOOK_URL 被设置 → 走 Webhook 机器人模式（最简单，适合内测）
 *  - 如需自建应用的文本/卡片消息，可扩展为 access_token 模式
 *
 * 约束：
 *  - 仅负责一次调用；外层 NotificationsService 管理重试与降级
 *  - 非 2xx 或 errcode≠0 时抛错，确保上层可感知
 *  - 错误信息中的 URL 必须脱敏（Webhook URL 的 ?key= 即发送凭证）
 */
@Injectable()
export class HttpWecomNotifierService implements WecomNotifierPort {
  private readonly logger = new Logger(HttpWecomNotifierService.name)

  /**
   * 读取并校验 WECOM_WEBHOOK_URL。
   * - 未配置 → 抛错（由 NotificationsModule 选用 Noop 实现，正常不会走到此处）
   * - 非 HTTPS → 抛错（M3：企微 Webhook 必须走 HTTPS，规避明文泄露与错配）
   *
   * MEDIUM-4：错误消息不得回显完整 URL（含 `?key=xxx` 发送凭证），统一走 redact。
   */
  private getWebhookUrl(): string {
    const raw = process.env.WECOM_WEBHOOK_URL?.trim()
    if (!raw) {
      throw new Error(
        'WECOM_WEBHOOK_URL 未配置；若需要降级静默行为请使用 NoopWecomNotifierService',
      )
    }
    let parsed: URL
    try {
      parsed = new URL(raw)
    } catch {
      throw new Error(
        `WECOM_WEBHOOK_URL 非法：无法解析为 URL（${redactWebhookUrl(raw)}）`,
      )
    }
    if (parsed.protocol !== 'https:') {
      throw new Error(
        `WECOM_WEBHOOK_URL 必须使用 https 协议，当前为 ${parsed.protocol}（${redactWebhookUrl(raw)}）`,
      )
    }
    return raw
  }

  /**
   * 读取前端 Web Base URL，用于构造企微深链绝对地址。
   *
   * MEDIUM-2：优先复用项目既有 `APP_PUBLIC_URL`（auth 模块重置密码邮件也使用它），
   * 回退到 `APP_WEB_BASE_URL` 仅为向后兼容，未来版本可废弃。
   * 两者都未配置时抛错，由 NotificationsService 统一走失败重试/降级。
   */
  private requireAppWebBaseUrl(): string {
    const base =
      process.env.APP_PUBLIC_URL?.trim() ?? process.env.APP_WEB_BASE_URL?.trim() ?? ''
    if (!base) {
      throw new Error(
        'APP_PUBLIC_URL 未配置：企业微信通知深链需要绝对 URL；请设置 APP_PUBLIC_URL（兼容 APP_WEB_BASE_URL）或关闭 WECOM_WEBHOOK_URL。',
      )
    }
    try {
      const parsed = new URL(base)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('protocol')
      }
    } catch {
      throw new Error(`APP_PUBLIC_URL 非法：必须为 http(s) 绝对 URL，当前为 ${base}`)
    }
    return base
  }

  /**
   * 放弃通知深链路径（HIGH-1）。
   *
   * 架构约束（`architecture.md:104`）："通知服务统一生成深链 `/{role}/approvals?requirementId=<id>&step=<stage>&actionId=<id>&source=wecom`"。
   * 放弃事件面向业务方（role=business），默认路径 `/business/approvals`；前端路由（`router/index.ts`）
   * 已为该路径注册指向 `RequirementChatView` 的别名/重定向。
   * 运维层面若需指向其他前端路由（如历史版本 `/requirement/new`）可通过
   * `NOTIFICATION_ABANDON_DEEP_LINK_PATH` 覆写。
   */
  private getAbandonDeepLinkPath(): string {
    const raw = process.env.NOTIFICATION_ABANDON_DEEP_LINK_PATH?.trim()
    if (!raw) return '/business/approvals'
    if (!raw.startsWith('/')) return `/${raw}`
    return raw
  }

  private getTimeoutMs(): number {
    const raw = process.env.WECOM_HTTP_TIMEOUT_MS?.trim()
    const n = raw ? parseInt(raw, 10) : NaN
    if (!Number.isFinite(n)) return 5_000
    return Math.min(Math.max(n, 1_000), 30_000)
  }

  async sendRequirementAbandoned(
    payload: WecomRequirementAbandonedPayload,
  ): Promise<{ externalMessageId?: string }> {
    const url = this.getWebhookUrl()

    const deepLink = this.buildDeepLink(payload)
    const lines: string[] = [
      `【需求已放弃】${payload.requirementTitle}`,
      `放弃原因：${payload.reason}`,
      `发生时间：${payload.occurredAt}`,
      `查看详情：${deepLink}`,
    ]

    const mentioned = (payload.mentionedWecomUserIds ?? []).filter(
      (s): s is string => typeof s === 'string' && s.trim().length > 0,
    )
    // HIGH-3：若有 mentioned_list 则前置声明通知对象，让群聊中的被提及者更直观看到
    if (mentioned.length > 0) {
      lines.splice(1, 0, `通知对象：${mentioned.map((u) => `@${u}`).join(' ')}`)
    }

    const textBody: { content: string; mentioned_list?: string[] } = {
      content: lines.join('\n'),
    }
    if (mentioned.length > 0) {
      textBody.mentioned_list = mentioned
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.getTimeoutMs())

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msgtype: 'text', text: textBody }),
        signal: controller.signal,
      })
      if (!res.ok) {
        throw new Error(`wecom http ${res.status} ${res.statusText}`)
      }
      const body = (await res.json().catch(() => ({}))) as {
        errcode?: number
        errmsg?: string
        msgid?: string
      }
      if (body.errcode != null && body.errcode !== 0) {
        throw new Error(`wecom errcode=${body.errcode} errmsg=${body.errmsg ?? 'unknown'}`)
      }
      return { externalMessageId: body.msgid }
    } finally {
      clearTimeout(timer)
    }
  }

  private buildDeepLink(payload: WecomRequirementAbandonedPayload): string {
    const base = this.requireAppWebBaseUrl()
    const { requirementId, step, actionId, source } = payload.deepLinkParams
    const qs = new URLSearchParams({
      requirementId,
      step,
      actionId,
      ...(source ? { source } : {}),
    }).toString()
    const path = this.getAbandonDeepLinkPath()
    return `${base.replace(/\/$/, '')}${path}?${qs}`
  }
}
