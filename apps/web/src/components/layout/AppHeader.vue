<script setup lang="ts">
import { BellIcon, MagnifyingGlassIcon, UserCircleIcon } from '@heroicons/vue/24/outline'
import { computed, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useRouter } from 'vue-router'
import { ApiError } from '@/api/client'
import { authApi } from '@/features/auth/api'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const title = computed(() => {
  if (route.path.startsWith('/admin/role')) return '系统管理 / 角色管理'
  if (route.path.startsWith('/admin/account')) return '系统管理 / 账号管理'
  if (route.path.startsWith('/admin/business-unit')) return '系统管理 / 业务板块管理'
  if (route.path.startsWith('/requirement/new')) return '与 AI 对话式生成需求方案'
  if (route.path.startsWith('/requirement')) return '需求管理'
  if (route.path.startsWith('/task')) return '任务管理'
  return '工作台看板'
})

const showChangePwd = ref(false)
const pwdLoading = ref(false)
const pwdError = ref('')
const pwdForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirm: '',
})

async function handleLogout() {
  authStore.logout()
  await router.push('/login')
}

function openChangePwd() {
  pwdError.value = ''
  pwdForm.currentPassword = ''
  pwdForm.newPassword = ''
  pwdForm.confirm = ''
  showChangePwd.value = true
}

async function submitChangePwd() {
  if (pwdLoading.value) return
  pwdError.value = ''
  if (pwdForm.newPassword.length < 8) {
    pwdError.value = '新密码至少 8 位'
    return
  }
  if (pwdForm.newPassword !== pwdForm.confirm) {
    pwdError.value = '两次输入的新密码不一致'
    return
  }
  pwdLoading.value = true
  try {
    await authApi.changePassword({
      currentPassword: pwdForm.currentPassword,
      newPassword: pwdForm.newPassword,
    })
    showChangePwd.value = false
    authStore.logout()
    await router.push('/login')
  } catch (error) {
    pwdError.value =
      error instanceof ApiError ? error.message : '修改失败，请稍后重试'
  } finally {
    pwdLoading.value = false
  }
}
</script>

<template>
  <header class="flex h-16 items-center justify-between border-b border-border bg-white px-6 shadow-sm">
    <div>
      <p class="text-sm font-semibold text-text-primary">{{ title }}</p>
      <p class="text-xs text-text-muted">需求全流程闭环交付系统</p>
    </div>

    <div class="flex items-center gap-4">
      <label class="hidden items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm text-text-muted sm:flex">
        <MagnifyingGlassIcon class="h-4 w-4" />
        <input
          class="w-52 bg-transparent text-xs outline-none placeholder:text-slate-400"
          placeholder="搜索需求或资产..."
        />
      </label>
      <button class="relative rounded-lg p-2 text-text-muted transition hover:text-primary-600" aria-label="通知">
        <BellIcon class="h-5 w-5" />
        <span class="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-danger"></span>
      </button>
      <button
        class="flex items-center gap-2 rounded-lg p-1.5 text-text-muted transition hover:bg-primary-50 hover:text-primary-600"
        aria-label="用户菜单"
      >
        <UserCircleIcon class="h-6 w-6" />
        <span
          v-if="authStore.isAuthenticated"
          class="text-xs text-text-secondary"
        >
          {{ authStore.user?.name ?? '管理员' }}
        </span>
      </button>
      <button
        v-if="authStore.isAuthenticated"
        class="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:bg-slate-100"
        type="button"
        @click="openChangePwd"
      >
        修改密码
      </button>
      <button
        v-if="authStore.isAuthenticated"
        class="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:bg-slate-100"
        type="button"
        @click="handleLogout"
      >
        退出
      </button>
    </div>

    <div
      v-if="showChangePwd"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="change-password-dialog"
      @click.self="showChangePwd = false"
    >
      <div class="w-full max-w-sm rounded-xl border border-border bg-white p-5 shadow-modal" @click.stop>
        <h3 class="text-sm font-semibold text-text-primary">修改密码</h3>
        <p class="mt-1 text-xs text-text-muted">修改成功后将退出登录，请用新密码重新登录。</p>
        <form class="mt-4 space-y-3" @submit.prevent="submitChangePwd">
          <label class="block text-sm">
            <span class="mb-1 block text-text-secondary">当前密码</span>
            <input
              v-model="pwdForm.currentPassword"
              type="password"
              required
              autocomplete="current-password"
              class="w-full rounded border border-border px-2 py-1.5 text-sm"
            />
          </label>
          <label class="block text-sm">
            <span class="mb-1 block text-text-secondary">新密码</span>
            <input
              v-model="pwdForm.newPassword"
              type="password"
              minlength="8"
              required
              autocomplete="new-password"
              class="w-full rounded border border-border px-2 py-1.5 text-sm"
            />
          </label>
          <label class="block text-sm">
            <span class="mb-1 block text-text-secondary">确认新密码</span>
            <input
              v-model="pwdForm.confirm"
              type="password"
              minlength="8"
              required
              autocomplete="new-password"
              class="w-full rounded border border-border px-2 py-1.5 text-sm"
            />
          </label>
          <p v-if="pwdError" class="text-xs text-danger">{{ pwdError }}</p>
          <div class="flex justify-end gap-2 pt-1">
            <button
              type="button"
              class="rounded border border-border px-3 py-1.5 text-sm"
              @click="showChangePwd = false"
            >
              取消
            </button>
            <button
              type="submit"
              class="rounded bg-primary-600 px-3 py-1.5 text-sm text-white disabled:opacity-60"
              :disabled="pwdLoading"
            >
              {{ pwdLoading ? '保存中...' : '保存' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </header>
</template>
