<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  HomeIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
} from '@heroicons/vue/24/outline'

const route = useRoute()
const router = useRouter()

const navigation = computed(() => [
  { name: '工作台看板', path: '/', icon: HomeIcon },
  { name: '发起需求', path: '/requirement/new', icon: ChatBubbleLeftRightIcon },
  { name: '任务管理', path: '/task', icon: ClipboardDocumentListIcon },
  { name: '系统管理', path: '/admin', icon: Cog6ToothIcon },
])

const adminNavigation = [
  { name: '业务板块管理', path: '/admin/business-unit' },
  { name: '账号管理', path: '/admin/account' },
  { name: '角色管理', path: '/admin/role' },
]

function isActive(path: string) {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}
</script>

<template>
  <aside class="hidden w-64 flex-col border-r border-slate-800 bg-slate-900 text-slate-300 md:flex">
    <div class="flex h-16 items-center gap-3 border-b border-slate-800 px-6">
      <div class="flex h-8 w-8 items-center justify-center rounded bg-gradient-to-br from-primary-600 to-purple-500 text-sm font-bold text-white shadow-lg">
        AI
      </div>
      <span class="text-sm font-semibold tracking-wide text-white">AI 交付中枢</span>
    </div>

    <nav class="flex-1 space-y-2 px-4 py-6">
      <p class="px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">主工作区</p>
      <button
        v-for="item in navigation"
        :key="item.path"
        class="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors"
        :class="
          isActive(item.path)
            ? 'bg-primary-600 font-medium text-white shadow-md'
            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        "
        @click="router.push(item.path)"
      >
        <component
          :is="item.icon"
          class="h-5 w-5 shrink-0"
          :class="isActive(item.path) ? 'text-white' : 'text-slate-400 group-hover:text-white'"
        />
        {{ item.name }}
      </button>

      <p class="mt-8 px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">系统管理</p>
      <div class="space-y-1">
        <button
          v-for="item in adminNavigation"
          :key="item.path"
          class="block w-full rounded-lg px-3 py-2 text-left text-xs transition-colors"
          :class="
            isActive(item.path)
              ? 'bg-slate-800 font-medium text-white'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          "
          @click="router.push(item.path)"
        >
          {{ item.name }}
        </button>
      </div>
    </nav>

    <div class="border-t border-slate-800 p-4">
      <div class="flex items-center gap-3">
        <div class="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
          AD
        </div>
        <div>
          <p class="text-sm font-medium text-white">管理员</p>
          <p class="text-xs text-slate-500">端到端交付负责人</p>
        </div>
      </div>
    </div>
  </aside>
</template>
