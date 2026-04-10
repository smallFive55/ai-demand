<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ApiError } from '@/api/client'
import { authApi } from '@/features/auth/api'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const loading = ref(false)
const errorMessage = ref('')
const form = reactive({
  username: 'admin',
  password: 'admin123456',
})

async function submit() {
  if (loading.value) return
  errorMessage.value = ''
  loading.value = true
  try {
    const result = await authApi.login({
      username: form.username,
      password: form.password,
    })
    authStore.setAuth(result.user, result.token)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(redirect)
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError ? error.message : '登录失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-surface p-6">
    <div class="w-full max-w-md rounded-xl border border-border bg-surface-card p-6 shadow-sm">
      <h1 class="text-xl font-semibold text-text-primary">管理员登录</h1>
      <p class="mt-1 text-sm text-text-muted">默认账号：admin / admin123456</p>

      <form class="mt-6 space-y-4" @submit.prevent="submit">
        <label class="block text-sm">
          <span class="mb-1 block text-text-secondary">用户名</span>
          <input
            v-model="form.username"
            class="w-full rounded-lg border border-border px-3 py-2"
            autocomplete="username"
            required
          />
        </label>

        <label class="block text-sm">
          <span class="mb-1 block text-text-secondary">密码</span>
          <input
            v-model="form.password"
            type="password"
            class="w-full rounded-lg border border-border px-3 py-2"
            autocomplete="current-password"
            required
          />
        </label>

        <p v-if="errorMessage" class="rounded bg-red-50 px-3 py-2 text-sm text-danger">
          {{ errorMessage }}
        </p>

        <button
          class="w-full rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-text-inverse hover:bg-primary-700 disabled:opacity-60"
          type="submit"
          :disabled="loading"
        >
          {{ loading ? '登录中...' : '登录' }}
        </button>
      </form>
    </div>
  </div>
</template>
