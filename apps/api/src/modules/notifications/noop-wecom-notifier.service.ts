import { Injectable, Logger } from '@nestjs/common'
import type { WecomNotifierPort } from './wecom-notifier.port'
import type {
  WecomRequirementAbandonedPayload,
  WecomRequirementReceivedPayload,
} from './notifications.types'

/**
 * 未配置企业微信 Webhook / Corp 参数时使用的降级桩。
 * 不抛错，仅记录日志，便于开发环境与离线测试。
 * 真实发送请通过 HttpWecomNotifier（配置 WECOM_WEBHOOK_URL 启用）。
 */
@Injectable()
export class NoopWecomNotifierService implements WecomNotifierPort {
  private readonly logger = new Logger(NoopWecomNotifierService.name)

  async sendRequirementAbandoned(
    payload: WecomRequirementAbandonedPayload,
  ): Promise<{ externalMessageId?: string }> {
    this.logger.debug(
      `[noop wecom] event=${payload.eventName} requirement=${payload.requirementId} recipient=${payload.recipientId}`,
    )
    return {}
  }

  async sendRequirementReceived(
    payload: WecomRequirementReceivedPayload,
  ): Promise<{ externalMessageId?: string }> {
    this.logger.debug(
      `[noop wecom] event=${payload.eventName} requirement=${payload.requirementId} recipient=${payload.recipientId} source=${payload.source}`,
    )
    return {}
  }
}
