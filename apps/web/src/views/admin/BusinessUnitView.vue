<script setup lang="ts">
import { PlusIcon } from '@heroicons/vue/24/outline'
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-text-primary">业务板块管理</h1>
        <p class="mt-1 text-sm text-text-muted">统一配置业务线与治理规则</p>
      </div>
      <button class="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-text-inverse transition hover:bg-primary-700">
        <PlusIcon class="h-4 w-4" />
        新建板块
      </button>
    </div>

    <div class="rounded-xl border border-border bg-white shadow-card">
      <div class="border-b border-border px-5 py-3">
        <h2 class="text-sm font-semibold text-text-primary">板块列表</h2>
      </div>
      <div class="flex min-h-72 items-center justify-center p-6">
        <p class="text-center text-sm text-text-muted">暂无业务板块</p>
      </div>
    </div>
  </div>
</template>
