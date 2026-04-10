<script setup lang="ts">
import { reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ApiError } from '@/api/client'
import { authApi } from '@/features/auth/api'

const loading = ref(false)
const errorMessage = ref('')
const done = ref(false)
const form = reactive({ email: '' })

async function submit() {
  if (loading.value) return
  errorMessage.value = ''
  loading.value = true
  try {
    await authApi.forgotPassword(form.email.trim())
    done.value = true
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError ? error.message : '提交失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 p-6">
    <div class="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary-200/60 blur-3xl"></div>
    <div class="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-purple-200/60 blur-3xl"></div>

    <div class="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
      <h1 class="text-xl font-semibold text-text-primary">忘记密码</h1>
      <p class="mt-2 text-sm text-text-muted">
        请输入登录时使用的邮箱。若该邮箱已注册，我们将发送重置链接（需配置 SMTP）；未配置邮件时，可由管理员开启日志输出或为您重置。
      </p>

      <div v-if="done" class="mt-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
        若该邮箱已在系统中注册，您将收到一封包含重置链接的邮件（请检查垃圾箱）。长时间未收到请联系管理员。
      </div>

      <form v-else class="mt-6 space-y-4" @submit.prevent="submit">
        <label class="block text-sm">
          <span class="mb-1 block text-text-secondary">邮箱</span>
          <input
            v-model="form.email"
            type="email"
            required
            autocomplete="email"
            class="w-full rounded-lg border border-border bg-slate-50 px-3 py-2"
          />
        </label>

        <p v-if="errorMessage" class="rounded bg-red-50 px-3 py-2 text-sm text-danger">
          {{ errorMessage }}
        </p>

        <button
          type="submit"
          class="w-full rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-text-inverse transition hover:bg-primary-700 disabled:opacity-60"
          :disabled="loading"
        >
          {{ loading ? '提交中...' : '发送重置指引' }}
        </button>
      </form>

      <p class="mt-6 text-center text-sm text-text-muted">
        <RouterLink to="/login" class="text-primary-600 hover:underline">返回登录</RouterLink>
      </p>
    </div>
  </div>
</template>
