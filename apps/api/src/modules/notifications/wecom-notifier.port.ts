import type { WecomRequirementAbandonedPayload } from './notifications.types'

/**
 * 企业微信通知发送端口（Story 2.3 Task 3）。
 *
 * 实现需保证：
 * - 网络/API 级失败抛出 Error（由上层 NotificationsService 统一重试）
 * - 不得在实现内做指数退避；重试语义在 NotificationsService 统一管理
 * - 返回 externalMessageId 便于审计
 */
export interface WecomNotifierPort {
  sendRequirementAbandoned(
    payload: WecomRequirementAbandonedPayload,
  ): Promise<{ externalMessageId?: string }>
}

export const WECOM_NOTIFIER = Symbol('WECOM_NOTIFIER')
