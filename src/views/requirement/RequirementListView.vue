<script setup lang="ts">
import { useRouter } from 'vue-router'
import { PlusIcon, FunnelIcon } from '@heroicons/vue/24/outline'

const router = useRouter()
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold text-text-primary">需求列表</h1>
      <div class="flex items-center gap-3">
        <button class="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted hover:bg-surface transition-colors">
          <FunnelIcon class="h-4 w-4" />
          筛选
        </button>
        <button
          class="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-text-inverse hover:bg-primary-700 transition-colors"
          @click="router.push('/requirement/new')"
        >
          <PlusIcon class="h-4 w-4" />
          提交需求
        </button>
      </div>
    </div>

    <!-- Empty state -->
    <div class="flex flex-col items-center justify-center rounded-xl border border-border bg-surface-card py-20">
      <p class="text-sm text-text-muted">暂无需求数据</p>
    </div>
  </div>
</template>
