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
  /** 预留：后续与板块/准入对接（非本故事验收项） */
  suggestedBusinessUnitId?: string
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

