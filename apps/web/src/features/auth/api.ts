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
}
