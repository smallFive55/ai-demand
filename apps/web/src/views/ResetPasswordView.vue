<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ApiError } from '@/api/client'
import { authApi } from '@/features/auth/api'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const errorMessage = ref('')
const token = ref('')

const form = reactive({
  newPassword: '',
  confirm: '',
})

const canSubmit = computed(
  () =>
    token.value.length > 0 &&
    form.newPassword.length >= 8 &&
    form.newPassword === form.confirm,
)

onMounted(() => {
  const q = route.query.token
  token.value = typeof q === 'string' ? q.trim() : ''
  if (!token.value) {
    errorMessage.value = '链接无效或已过期，请从邮件中重新打开重置链接。'
  }
})

async function submit() {
  if (!canSubmit.value || loading.value) return
  errorMessage.value = ''
  loading.value = true
  try {
    await authApi.resetPassword({ token: token.value, newPassword: form.newPassword })
    await router.replace({ path: '/login', query: { reset: 'ok' } })
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError ? error.message : '重置失败，请稍后重试或重新申请忘记密码'
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
      <h1 class="text-xl font-semibold text-text-primary">设置新密码</h1>
      <p class="mt-1 text-sm text-text-muted">新密码至少 8 位，请与确认密码保持一致。</p>

      <form class="mt-6 space-y-4" @submit.prevent="submit">
        <label class="block text-sm">
          <span class="mb-1 block text-text-secondary">新密码</span>
          <input
            v-model="form.newPassword"
            type="password"
            minlength="8"
            required
            autocomplete="new-password"
            class="w-full rounded-lg border border-border bg-slate-50 px-3 py-2"
          />
        </label>
        <label class="block text-sm">
          <span class="mb-1 block text-text-secondary">确认新密码</span>
          <input
            v-model="form.confirm"
            type="password"
            minlength="8"
            required
            autocomplete="new-password"
            class="w-full rounded-lg border border-border bg-slate-50 px-3 py-2"
          />
        </label>

        <p v-if="form.confirm && form.newPassword !== form.confirm" class="text-sm text-danger">
          两次输入的密码不一致
        </p>

        <p v-if="errorMessage" class="rounded bg-red-50 px-3 py-2 text-sm text-danger">
          {{ errorMessage }}
        </p>

        <button
          type="submit"
          class="w-full rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-text-inverse transition hover:bg-primary-700 disabled:opacity-60"
          :disabled="!canSubmit || loading"
        >
          {{ loading ? '保存中...' : '保存新密码' }}
        </button>
      </form>

      <p class="mt-6 text-center text-sm text-text-muted">
        <RouterLink to="/login" class="text-primary-600 hover:underline">返回登录</RouterLink>
      </p>
    </div>
  </div>
</template>
