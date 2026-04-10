export type {
  CollectedFields,
  Requirement,
  RequirementFieldSnapshot,
  RequirementMessage,
  RequirementMessageRole,
  RequirementStatus,
} from '@ai-demand/contracts'

import type { RequirementStatus } from '@ai-demand/contracts'

export const STATUS_LABEL: Record<RequirementStatus, string> = {
  collecting: '对话收集中',
  received: '已接待',
  pending_manager_review: '待交付经理审查',
  pending_business_review: '待业务方评审',
  pending_task_approval: '待任务审批',
  in_development: '开发中',
  ai_executing: 'AI 执行中',
  pending_delivery_approval: '待交付审批',
  pending_acceptance: '待业务方验收',
  accepted: '已验收',
  pending_follow_up: '待跟进上线成果',
  reviewed: '已复盘',
  abandoned: '已放弃',
}

export const STATUS_COLOR: Record<RequirementStatus, string> = {
  collecting: 'bg-status-collecting',
  received: 'bg-status-received',
  pending_manager_review: 'bg-status-pending-review',
  pending_business_review: 'bg-status-pending-review',
  pending_task_approval: 'bg-status-pending-review',
  in_development: 'bg-status-in-progress',
  ai_executing: 'bg-status-in-progress',
  pending_delivery_approval: 'bg-status-pending-review',
  pending_acceptance: 'bg-status-pending-accept',
  accepted: 'bg-status-completed',
  pending_follow_up: 'bg-status-pending-review',
  reviewed: 'bg-status-completed',
  abandoned: 'bg-status-abandoned',
}
