<script setup lang="ts">
import { BellIcon, MagnifyingGlassIcon, UserCircleIcon } from '@heroicons/vue/24/outline'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useRouter } from 'vue-router'
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

async function handleLogout() {
  authStore.logout()
  await router.push('/login')
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
        @click="handleLogout"
      >
        退出
      </button>
    </div>
  </header>
</template>
