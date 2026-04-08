<script setup lang="ts">
import { PlusIcon } from '@heroicons/vue/24/outline'
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold text-text-primary">业务板块管理</h1>
      <button class="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-text-inverse hover:bg-primary-700 transition-colors">
        <PlusIcon class="h-4 w-4" />
        新建板块
      </button>
    </div>
    <div class="rounded-xl border border-border bg-surface-card p-6">
      <p class="text-center text-sm text-text-muted">暂无业务板块</p>
    </div>
  </div>
</template>
