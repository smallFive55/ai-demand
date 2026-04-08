<script setup lang="ts">
const columns = [
  { id: 'pending', title: '待处理', color: 'bg-warning' },
  { id: 'in_progress', title: '进行中', color: 'bg-info' },
  { id: 'review', title: '待审批', color: 'bg-status-pending-accept' },
  { id: 'done', title: '已完成', color: 'bg-success' },
]
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-bold text-text-primary">任务看板</h1>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <div
        v-for="col in columns"
        :key="col.id"
        class="flex flex-col rounded-xl border border-border bg-surface-card"
      >
        <div class="flex items-center gap-2 border-b border-border px-4 py-3">
          <span class="h-2 w-2 rounded-full" :class="col.color" />
          <h3 class="text-sm font-medium text-text-primary">{{ col.title }}</h3>
          <span class="ml-auto text-xs text-text-muted">0</span>
        </div>
        <div class="flex-1 p-3">
          <p class="py-8 text-center text-xs text-text-muted">暂无任务</p>
        </div>
      </div>
    </div>
  </div>
</template>
