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
  { name: '工作台', path: '/', icon: HomeIcon },
  { name: '需求管理', path: '/requirement', icon: ChatBubbleLeftRightIcon },
  { name: '任务管理', path: '/task', icon: ClipboardDocumentListIcon },
  { name: '系统管理', path: '/admin', icon: Cog6ToothIcon },
])

function isActive(path: string) {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}
</script>

<template>
  <aside class="flex w-60 flex-col border-r border-border bg-surface-card">
    <!-- Logo -->
    <div class="flex h-14 items-center gap-2 border-b border-border px-4">
      <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-text-inverse text-sm font-bold">
        AI
      </div>
      <span class="text-sm font-semibold text-text-primary">需求管理系统</span>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 space-y-1 p-3">
      <button
        v-for="item in navigation"
        :key="item.path"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
        :class="
          isActive(item.path)
            ? 'bg-primary-50 text-primary-700 font-medium'
            : 'text-text-muted hover:bg-primary-50/50 hover:text-text-secondary'
        "
        @click="router.push(item.path)"
      >
        <component :is="item.icon" class="h-5 w-5 shrink-0" />
        {{ item.name }}
      </button>
    </nav>
  </aside>
</template>
