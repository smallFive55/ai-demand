<script setup lang="ts">
defineProps<{ id: string }>()
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-text-primary">需求详情</h1>
      <p class="mt-1 text-sm text-text-muted">查看 PRD、审批状态与流转轨迹</p>
    </div>

    <div class="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section class="rounded-xl border border-border bg-white shadow-card">
        <header class="border-b border-border px-6 py-4">
          <p class="text-sm font-semibold text-text-primary">结构化 PRD</p>
          <p class="mt-1 text-xs text-text-muted">需求 ID: {{ id }}</p>
        </header>
        <div class="space-y-5 px-6 py-6">
          <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 class="text-sm font-semibold text-text-primary">业务背景与目标</h3>
            <p class="mt-2 text-sm text-text-secondary">该需求的详细文档正在接入中，后续将展示 AI 生成的完整 PRD 与原型链接。</p>
          </div>
          <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 class="text-sm font-semibold text-text-primary">功能范围</h3>
            <p class="mt-2 text-sm text-text-secondary">将包含核心流程、数据约束、异常处理与验收标准。</p>
          </div>
        </div>
      </section>

      <aside class="rounded-xl border border-border bg-white shadow-card">
        <header class="border-b border-border px-5 py-4">
          <h2 class="text-sm font-semibold text-text-primary">决策与推进</h2>
          <p class="mt-1 text-xs text-text-muted">双轨审批工作面板</p>
        </header>
        <div class="space-y-4 px-5 py-5">
          <div class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            当前阶段：待评审
          </div>
          <button class="w-full rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-primary-700">
            方案通过并推进
          </button>
          <button class="w-full rounded-md border border-border px-3 py-2 text-sm text-text-secondary transition hover:bg-slate-50">
            打回修改
          </button>
          <div class="pt-2">
            <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">流转轨迹</p>
            <ol class="space-y-3 text-xs text-text-muted">
              <li>09:18 - 发送业务方评审通知</li>
              <li>09:16 - 交付经理完成初审</li>
              <li>09:00 - 需求提交并进入 AI 处理</li>
            </ol>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>
