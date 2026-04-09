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

