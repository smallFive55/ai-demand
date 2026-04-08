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
