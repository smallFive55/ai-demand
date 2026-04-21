/**
 * @ai-demand/contracts
 *
 * 前后端共享的 API 契约与 DTO 类型定义
 * 后续在此添加 OpenAPI schema 与请求/响应类型
 */

export interface ApiEnvelope<T> {
  success: boolean
  data: T
  message?: string
  timestamp: string
}

export interface HealthResponse {
  status: 'ok' | 'error'
  timestamp: string
  service: string
}

export interface PaginationQuery {
  page?: number
  pageSize?: number
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type AccountStatus = 'enabled' | 'disabled'

export interface AdminAccount {
  id: string
  name: string
  email: string
  roleId: string
  status: AccountStatus
  createdAt: string
  updatedAt: string
}

export interface CreateAccountPayload {
  name: string
  email: string
  roleId: string
  /**
   * 登录密码（≥8 位）。单条创建时必填以开通登录。
   * 批量导入时可选：缺省则仅写入组织账号，不创建登录用户。
   */
  password?: string
}

export interface UpdateAccountPayload {
  name?: string
  roleId?: string
}

export interface ImportAccountError {
  index: number
  reasonCode: string
  message: string
}

export interface ImportAccountResponse {
  successCount: number
  failureCount: number
  errors: ImportAccountError[]
}

// ── Role & Permission ──────────────────────────────────────────

export type RoleStatus = 'enabled' | 'disabled'

export type PermissionScopeType = 'all' | 'project' | 'businessLine'

export interface PermissionScope {
  type: PermissionScopeType
  ids?: string[]
}

export interface PermissionEntry {
  resource: string
  actions: string[]
  scope: PermissionScope
}

export interface AdminRole {
  id: string
  name: string
  description: string
  status: RoleStatus
  permissions: PermissionEntry[]
  createdAt: string
  updatedAt: string
}

export interface CreateRolePayload {
  name: string
  description?: string
  permissions?: PermissionEntry[]
}

export interface UpdateRolePayload {
  name?: string
  description?: string
  permissions?: PermissionEntry[]
}

// ── Business unit (板块) ───────────────────────────────────────

export type BusinessUnitStatus = 'enabled' | 'disabled'

export interface BusinessUnit {
  id: string
  name: string
  description: string
  functionList: string[]
  deliveryManagerId: string
  admissionCriteria: string
  admissionThreshold: number
  status: BusinessUnitStatus
  createdAt: string
  updatedAt: string
}

export interface CreateBusinessUnitPayload {
  name: string
  description: string
  functionList: string[]
  deliveryManagerId: string
  admissionCriteria: string
  admissionThreshold?: number
}

export interface UpdateBusinessUnitPayload {
  name?: string
  description?: string
  functionList?: string[]
  deliveryManagerId?: string
  admissionCriteria?: string
  admissionThreshold?: number
}

// ── Requirement intake（接待阶段）────────────────────────────────

export type RequirementStatus =
  | 'collecting'
  | 'received'
  | 'pending_manager_review'
  | 'pending_business_review'
  | 'pending_task_approval'
  | 'in_development'
  | 'ai_executing'
  | 'pending_delivery_approval'
  | 'pending_acceptance'
  | 'accepted'
  | 'pending_follow_up'
  | 'reviewed'
  | 'abandoned'

/** 消息角色：用户 / AI / 系统 */
export type RequirementMessageRole = 'user' | 'ai' | 'system'

/**
 * 对话收集的关键字段（最小集：目标/背景、核心功能或范围、预期效果或成功标准）
 */
export interface CollectedFields {
  /** 目标 / 背景 */
  goalBackground?: string
  /** 核心功能或范围 */
  coreScope?: string
  /** 预期效果或成功标准 */
  successCriteria?: string
  /** AI 建议的拟归属板块（须由服务端校验是否为启用板块） */
  suggestedBusinessUnitId?: string
}

/** 项目识别 + 准入评估的可展示结论（持久化于需求行） */
export interface AdmissionAssessment {
  /** 当前拟归属业务板块 ID；无法识别或未选定时为 null */
  businessUnitId: string | null
  /** 关联项目 ID（可为空数组） */
  projectIds: string[]
  /** 与板块准入标准对照后的匹配度 0–100；尚未评估时为 null */
  admissionScore: number | null
  /** 可选说明（模型或规则生成） */
  admissionRationale?: string
}

export interface Requirement {
  id: string
  title: string
  description: string
  status: RequirementStatus
  projectIds: string[]
  submitterId: string
  deliveryManagerId?: string
  prdUrl?: string
  prototypeUrl?: string
  /** 接待对话产生的最新结构化字段（列表页可为空对象） */
  collectedFields: CollectedFields
  /** 识别与准入评估结果视图（与库字段一致） */
  admissionAssessment: AdmissionAssessment
  createdAt: string
  updatedAt: string
}

export interface RequirementMessage {
  id: string
  requirementId: string
  role: RequirementMessageRole
  content: string
  createdAt: string
}

export interface RequirementFieldSnapshot {
  id: string
  requirementId: string
  version: number
  collectedFields: CollectedFields
  createdAt: string
}

export interface CreateRequirementResponse extends Requirement {}

export interface AppendRequirementMessagePayload {
  content: string
}

export interface AppendRequirementMessageResponse {
  userMessage: RequirementMessage
  aiMessage: RequirementMessage
  collectedFields: CollectedFields
}

/** 业务方可访问的启用板块摘要（不含管理员专属字段） */
export interface EnabledBusinessUnitSummary {
  id: string
  name: string
  description: string
  functionList: string[]
}

export interface PatchRequirementIntakePayload {
  /** 人工修正后的目标板块（须为当前启用板块） */
  businessUnitId: string
}

