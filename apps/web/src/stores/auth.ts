import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

const AUTH_TOKEN_KEY = 'auth_token'

export interface User {
  id: string
  name: string
  avatar?: string
  role: 'business' | 'delivery_manager' | 'admin'
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(localStorage.getItem(AUTH_TOKEN_KEY))

  const isAuthenticated = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const isDeliveryManager = computed(() => user.value?.role === 'delivery_manager')
  const isBusiness = computed(() => user.value?.role === 'business')

  function setAuth(u: User, t: string) {
    user.value = u
    token.value = t
    localStorage.setItem(AUTH_TOKEN_KEY, t)
  }

  function logout() {
    user.value = null
    token.value = null
    localStorage.removeItem(AUTH_TOKEN_KEY)
  }

  return { user, token, isAuthenticated, isAdmin, isDeliveryManager, isBusiness, setAuth, logout }
})
