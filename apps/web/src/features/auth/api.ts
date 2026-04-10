import { api } from '@/api/client'
import type { User } from '@/stores/auth'

interface LoginPayload {
  username: string
  password: string
}

interface LoginResponse {
  token: string
  user: User
}

export const authApi = {
  login: (payload: LoginPayload) => api.post<LoginResponse>('/auth/login', payload),
  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    api.post<{ ok: true }>('/auth/change-password', payload),
  forgotPassword: (email: string) => api.post<{ ok: true }>('/auth/forgot-password', { email }),
  resetPassword: (payload: { token: string; newPassword: string }) =>
    api.post<{ ok: true }>('/auth/reset-password', payload),
}
