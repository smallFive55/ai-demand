<script setup lang="ts">
defineProps<{ id: string }>()
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-text-primary">任务详情</h1>
      <p class="mt-1 text-sm text-text-muted">展示任务说明、执行进度与审计时间线</p>
    </div>

    <div class="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section class="rounded-xl border border-border bg-white shadow-card">
        <header class="border-b border-border px-6 py-4">
          <p class="text-sm font-semibold text-text-primary">任务信息</p>
          <p class="mt-1 text-xs text-text-muted">任务 ID: {{ id }}</p>
        </header>
        <div class="space-y-4 px-6 py-6">
          <div class="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-text-secondary">
            任务描述、验收标准与关联需求正在接入中。
          </div>
          <div class="rounded-lg border border-slate-200 p-4">
            <p class="mb-2 text-sm font-medium text-text-primary">执行进度</p>
            <div class="h-2 rounded-full bg-slate-100">
              <div class="h-2 w-1/4 rounded-full bg-primary-600"></div>
            </div>
            <p class="mt-2 text-xs text-text-muted">当前进度：25%</p>
          </div>
        </div>
      </section>

      <aside class="rounded-xl border border-border bg-white shadow-card">
        <header class="border-b border-border px-5 py-4">
          <h2 class="text-sm font-semibold text-text-primary">活动时间线</h2>
        </header>
        <ol class="space-y-3 px-5 py-5 text-xs text-text-muted">
          <li>09:30 - 任务进入开发中</li>
          <li>09:12 - PRD 评审通过</li>
          <li>09:00 - 任务创建</li>
        </ol>
      </aside>
    </div>
  </div>
</template>
