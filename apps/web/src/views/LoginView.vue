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
  <div class="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 p-6">
    <div class="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary-200/60 blur-3xl"></div>
    <div class="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-purple-200/60 blur-3xl"></div>

    <div class="relative grid w-full max-w-4xl grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card md:grid-cols-[1.2fr_1fr]">
      <div class="hidden bg-slate-900 px-8 py-10 text-white md:block">
        <div class="inline-flex h-10 w-10 items-center justify-center rounded bg-gradient-to-br from-primary-500 to-purple-500 text-sm font-bold">
          AI
        </div>
        <h2 class="mt-6 text-2xl font-bold">AI 交付中枢</h2>
        <p class="mt-2 text-sm text-slate-300">需求全流程闭环交付系统</p>
        <ul class="mt-8 space-y-3 text-sm text-slate-300">
          <li>• 对话生成 PRD 与原型方案</li>
          <li>• 双轨审批与任务自动拆解</li>
          <li>• 角色与权限矩阵统一治理</li>
        </ul>
      </div>

      <div class="p-6 md:p-8">
        <h1 class="text-xl font-semibold text-text-primary">管理员登录</h1>
        <p class="mt-1 text-sm text-text-muted">默认账号：admin / admin123456</p>

        <form class="mt-6 space-y-4" @submit.prevent="submit">
          <label class="block text-sm">
            <span class="mb-1 block text-text-secondary">用户名</span>
            <input
              v-model="form.username"
              class="w-full rounded-lg border border-border bg-slate-50 px-3 py-2"
              autocomplete="username"
              required
            />
          </label>

          <label class="block text-sm">
            <span class="mb-1 block text-text-secondary">密码</span>
            <input
              v-model="form.password"
              type="password"
              class="w-full rounded-lg border border-border bg-slate-50 px-3 py-2"
              autocomplete="current-password"
              required
            />
          </label>

          <p v-if="errorMessage" class="rounded bg-red-50 px-3 py-2 text-sm text-danger">
            {{ errorMessage }}
          </p>

          <button
            class="w-full rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-text-inverse transition hover:bg-primary-700 disabled:opacity-60"
            type="submit"
            :disabled="loading"
          >
            {{ loading ? '登录中...' : '登录' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
