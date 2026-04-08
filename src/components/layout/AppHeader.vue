<script setup lang="ts">
import { BellIcon, MagnifyingGlassIcon, UserCircleIcon } from '@heroicons/vue/24/outline'
</script>

<template>
  <header class="flex h-14 items-center justify-between border-b border-border bg-surface-card px-6">
    <!-- Search -->
    <div class="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-muted">
      <MagnifyingGlassIcon class="h-4 w-4" />
      <span>搜索需求...</span>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-4">
      <button
        class="relative rounded-lg p-1.5 text-text-muted hover:bg-primary-50 hover:text-primary-600 transition-colors"
        aria-label="通知"
      >
        <BellIcon class="h-5 w-5" />
      </button>
      <button
        class="flex items-center gap-2 rounded-lg p-1.5 text-text-muted hover:bg-primary-50 hover:text-primary-600 transition-colors"
        aria-label="用户菜单"
      >
        <UserCircleIcon class="h-6 w-6" />
      </button>
    </div>
  </header>
</template>
