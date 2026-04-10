import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

const AUTH_TOKEN_KEY = 'auth_token'
const AUTH_USER_KEY = 'auth_user'

export interface User {
  id: string
  name: string
  avatar?: string
  role: 'business' | 'delivery_manager' | 'admin'
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(readUserFromStorage())
  const token = ref<string | null>(localStorage.getItem(AUTH_TOKEN_KEY))

  hydrateUserFromToken()

  const isAuthenticated = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const isDeliveryManager = computed(() => user.value?.role === 'delivery_manager')
  const isBusiness = computed(() => user.value?.role === 'business')

  function setAuth(u: User, t: string) {
    user.value = u
    token.value = t
    localStorage.setItem(AUTH_TOKEN_KEY, t)
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(u))
  }

  function logout() {
    user.value = null
    token.value = null
    localStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(AUTH_USER_KEY)
  }

  function ensureUserFromToken() {
    if (!user.value && token.value) {
      user.value = parseUserFromToken(token.value)
      if (user.value) {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user.value))
      }
    }
  }

  function readUserFromStorage(): User | null {
    const raw = localStorage.getItem(AUTH_USER_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as User
    } catch {
      localStorage.removeItem(AUTH_USER_KEY)
      return null
    }
  }

  function parseUserFromToken(tokenValue: string): User | null {
    if (tokenValue === 'dev-admin-token') {
      return { id: 'dev-admin', name: '系统管理员', role: 'admin' }
    }

    if (tokenValue.startsWith('admin:')) {
      const rawId = tokenValue.slice('admin:'.length).trim()
      const id = rawId || 'admin-user'
      return { id, name: '系统管理员', role: 'admin' }
    }

    if (!tokenValue.includes('.')) {
      return null
    }

    try {
      const payload = tokenValue.split('.')[1]
      if (!payload) return null
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
      const json = atob(padded)
      const parsed = JSON.parse(json) as { sub?: string; userId?: string; role?: User['role']; name?: string }
      if (!parsed.role) return null
      return {
        id: parsed.sub ?? parsed.userId ?? 'user',
        name: parsed.name ?? '当前用户',
        role: parsed.role,
      }
    } catch {
      return null
    }
  }

  function hydrateUserFromToken() {
    if (!token.value || user.value) return
    user.value = parseUserFromToken(token.value)
    if (user.value) {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user.value))
    }
  }

  return {
    user,
    token,
    isAuthenticated,
    isAdmin,
    isDeliveryManager,
    isBusiness,
    setAuth,
    logout,
    ensureUserFromToken,
  }
})
