import { Injectable, Logger } from '@nestjs/common'
import type { WecomNotifierPort } from './wecom-notifier.port'
import type {
  RequirementDeepLinkParams,
  WecomRequirementAbandonedPayload,
  WecomRequirementReceivedPayload,
} from './notifications.types'
import { normalizeMentions, redactWebhookUrl } from './url-redact'

/**
 * 企业微信群机器人 / 自建应用消息发送器（Story 2.3 Task 3 建立，Story 2.4 扩展）。
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
   * 放弃通知深链路径（HIGH-1，Story 2.3）。
   *
   * 架构约束（`architecture.md:104`）："通知服务统一生成深链 `/{role}/approvals?requirementId=<id>&step=<stage>&actionId=<id>&source=wecom`"。
   * 放弃事件面向业务方（role=business），默认路径 `/business/approvals`。
   * 运维层面若需指向其他前端路由（如历史版本 `/requirement/new`）可通过
   * `NOTIFICATION_ABANDON_DEEP_LINK_PATH` 覆写。
   */
  private getAbandonDeepLinkPath(): string {
    return this.resolveDeepLinkPath(
      'NOTIFICATION_ABANDON_DEEP_LINK_PATH',
      '/business/approvals',
    )
  }

  /**
   * 接待成功通知深链路径（Story 2.4）。
   *
   * 面向交付经理（role=delivery-manager），默认路径 `/delivery-manager/approvals`；
   * 架构契约同 abandon 路径：`/{role}/approvals?requirementId=&step=review&actionId=&source=wecom`。
   * 运维层面允许通过 `NOTIFICATION_RECEIVED_DEEP_LINK_PATH` 覆写。
   */
  private getReceivedDeepLinkPath(): string {
    return this.resolveDeepLinkPath(
      'NOTIFICATION_RECEIVED_DEEP_LINK_PATH',
      '/delivery-manager/approvals',
    )
  }

  /** 归一化相对路径：env 空值→default；非 `/` 前导→补一个 */
  private resolveDeepLinkPath(envVar: string, defaultPath: string): string {
    const raw = process.env[envVar]?.trim()
    if (!raw) return defaultPath
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
    const deepLink = this.buildDeepLink(this.getAbandonDeepLinkPath(), payload.deepLinkParams)

    const lines: string[] = [
      `【需求已放弃】${payload.requirementTitle}`,
      `放弃原因：${payload.reason}`,
      `发生时间：${payload.occurredAt}`,
      `查看详情：${deepLink}`,
    ]

    const mentioned = normalizeMentions(payload.mentionedWecomUserIds)
    if (mentioned.length > 0) {
      lines.splice(1, 0, `通知对象：${mentioned.map((u) => `@${u}`).join(' ')}`)
    }

    return this.postTextMessage(url, lines.join('\n'), mentioned)
  }

  /**
   * Story 2.4：接待成功通知。
   *
   * 文案字段（AC3）：需求标题 / 需求编号 / 提交者 / 拟归属板块名 / 匹配度 / 放行来源 / 查看详情深链。
   */
  async sendRequirementReceived(
    payload: WecomRequirementReceivedPayload,
  ): Promise<{ externalMessageId?: string }> {
    const url = this.getWebhookUrl()
    const deepLink = this.buildDeepLink(this.getReceivedDeepLinkPath(), payload.deepLinkParams)

    const sourceLabel =
      payload.source === 'llm_intake' ? 'AI 自动评估' : '业务方手动修正板块'
    const lines: string[] = [
      `【需求已接待】${payload.requirementTitle}`,
      `需求编号：${payload.requirementId}`,
      `提交者：${payload.submitterId}`,
      `拟归属板块：${payload.businessUnitName}`,
      `匹配度：${payload.admissionScore}（阈值 ${payload.admissionThreshold}，已达标）`,
      `放行来源：${sourceLabel}`,
      `发生时间：${payload.occurredAt}`,
      `查看详情：${deepLink}`,
    ]

    const mentioned = normalizeMentions(payload.mentionedWecomUserIds)
    if (mentioned.length > 0) {
      lines.splice(1, 0, `通知对象：${mentioned.map((u) => `@${u}`).join(' ')}`)
    }

    return this.postTextMessage(url, lines.join('\n'), mentioned)
  }

  /** 共用：POST 文本消息并处理 status / errcode；复用原 abandon 实现骨架避免重复逻辑漂移 */
  private async postTextMessage(
    url: string,
    content: string,
    mentioned: string[],
  ): Promise<{ externalMessageId?: string }> {
    const textBody: { content: string; mentioned_list?: string[] } = { content }
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

  /** 共用深链拼装：base + path + ?requirementId=&step=&actionId=&source=  */
  private buildDeepLink(path: string, params: RequirementDeepLinkParams): string {
    const base = this.requireAppWebBaseUrl()
    const { requirementId, step, actionId, source } = params
    const qs = new URLSearchParams({
      requirementId,
      step,
      actionId,
      ...(source ? { source } : {}),
    }).toString()
    return `${base.replace(/\/$/, '')}${path}?${qs}`
  }
}
