<script setup lang="ts">
const columns = [
  { id: 'pending', title: '待处理', color: 'bg-warning' },
  { id: 'in_progress', title: '进行中', color: 'bg-info' },
  { id: 'review', title: '待审批', color: 'bg-status-pending-accept' },
  { id: 'done', title: '已完成', color: 'bg-success' },
]
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-text-primary">任务看板</h1>
      <p class="mt-1 text-sm text-text-muted">按阶段追踪任务执行状态与阻塞项</p>
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-4">
      <div
        v-for="col in columns"
        :key="col.id"
        class="min-h-[360px] rounded-xl border border-slate-200/80 bg-slate-100/60 p-4"
      >
        <div class="mb-3 flex items-center gap-2">
          <span class="h-2 w-2 rounded-full" :class="col.color" />
          <h3 class="text-sm font-semibold text-slate-700">{{ col.title }}</h3>
          <span class="ml-auto rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">0</span>
        </div>
        <div class="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-3">
          <p class="py-8 text-center text-xs text-text-muted">暂无任务</p>
        </div>
      </div>
    </div>
  </div>
</template>
