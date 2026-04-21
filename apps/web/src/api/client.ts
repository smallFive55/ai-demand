const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code?: string
    message?: string
  }
  meta?: {
    occurredAt?: string
    requestId?: string
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${BASE_URL}${path}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  }

  const token = localStorage.getItem('auth_token')
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(url, { ...options, headers })

  if (!res.ok) {
    const body: ApiResponse<T> = await res.json().catch(() => ({ success: false }))
    throw new ApiError(
      res.status,
      body.error?.code ?? 'UNKNOWN',
      body.error?.message ?? res.statusText,
      body.meta?.requestId,
    )
  }

  const json: ApiResponse<T> = await res.json()
  return json.data as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
