/**
 * 通知模块公共类型（Story 2.3 Task 3 建立，Story 2.4 扩展）
 *
 * 约束：
 * - 事件名遵循 `domain.entity.action.v1` 模式
 * - 深链参数最小集：requirementId / step / actionId（可附 source=wecom）
 * - 通知载荷对业务事务保持只读；传递给异步执行的值必须可 JSON 序列化
 */

/** 统一事件名常量，避免魔法字符串散落多处 */
export const NOTIFICATION_EVENTS = {
  REQUIREMENT_ABANDONED: 'requirement.status.abandoned.v1',
  /** Story 2.4：需求被接待后通知交付经理 */
  REQUIREMENT_RECEIVED: 'requirement.status.received.v1',
} as const

export type NotificationEventName =
  (typeof NOTIFICATION_EVENTS)[keyof typeof NOTIFICATION_EVENTS]

/** 深链参数（放弃 / 接待成功等事件共用） */
export interface RequirementDeepLinkParams {
  requirementId: string
  /** 流程步骤（abandon / review / ...） */
  step: string
  /** 单次通知动作唯一 ID，便于幂等追踪 */
  actionId: string
  /** 来源标识，便于前端区分深链入口 */
  source?: 'wecom' | 'email' | 'in-app'
}

/** 企业微信通知的渲染载荷（Story 2.3：放弃场景） */
export interface WecomRequirementAbandonedPayload {
  eventName: NotificationEventName
  /** 被通知的业务方用户 ID（提交者） */
  recipientId: string
  requirementId: string
  requirementTitle: string
  reason: string
  occurredAt: string
  deepLinkParams: RequirementDeepLinkParams
  /**
   * （HIGH-3）企业微信侧 userid 列表，用于自建应用 touser 或 Webhook 群机器人 `mentioned_list`。
   * 当前尚无 <内部 userId → 企微 userid> 映射表，默认 `[]` 表示以"群广播"形式触达；
   * 未来故事引入用户映射后从上层填充。
   */
  mentionedWecomUserIds?: string[]
}

/**
 * 企业微信通知渲染载荷（Story 2.4：接待成功场景）。
 *
 * 语义：`RequirementsService.applyCollectingToReceived` 成功迁移 `collecting -> received`
 * 后，由 `NotificationsService.notifyRequirementReceived` 编排发送给目标板块的
 * 交付经理（`BusinessUnit.deliveryManagerId`）。
 */
export interface WecomRequirementReceivedPayload {
  eventName: NotificationEventName
  /** 被通知的交付经理用户 ID（= BusinessUnit.deliveryManagerId） */
  recipientId: string
  requirementId: string
  requirementTitle: string
  /** 需求提交者（业务方）用户 ID，便于交付经理溯源 */
  submitterId: string
  /** 目标业务板块名称（用于通知文案中的"拟归属板块"字段） */
  businessUnitName: string
  /** 准入匹配度（0-100） */
  admissionScore: number
  /** 板块准入阈值（当前命中的阈值值，便于审计） */
  admissionThreshold: number
  /** 放行来源：LLM 自动评估 / 业务方手动修正板块 */
  source: 'llm_intake' | 'manual_patch'
  occurredAt: string
  deepLinkParams: RequirementDeepLinkParams
  /** 与 abandon 场景同语义；未来接入 userId → 企微 userid 映射后由上层填充 */
  mentionedWecomUserIds?: string[]
}

/** 通知触达目标策略（写入审计 metadata 便于运维筛选） */
export type NotificationRecipientTargeting = 'user_mentioned' | 'group_broadcast'

/** 通知一次发送的结果（供审计 / 重试 / 降级使用） */
export interface NotificationDispatchResult {
  success: boolean
  attempts: number
  /** 最后一次失败原因（成功时为 undefined） */
  lastError?: string
  /** 是否触发了降级（站内信/待办） */
  fallbackTriggered: boolean
  /** 企业微信侧返回的消息 ID（若有） */
  externalMessageId?: string
}
