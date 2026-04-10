<script setup lang="ts">
import { PlusIcon } from '@heroicons/vue/24/solid'
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-text-primary">工作台看板</h1>
        <p class="mt-1 text-sm text-text-muted">全局状态透视视图与待办流转</p>
      </div>
      <button
        class="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-text-inverse shadow-sm transition-colors hover:bg-primary-700"
        @click="router.push('/requirement/new')"
      >
        <PlusIcon class="h-4 w-4" />
        提交新需求
      </button>
    </div>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div
        v-for="stat in [
          { label: '待我处理的节点', value: '2', suffix: '项' },
          { label: '本月节省时间', value: '42', suffix: '小时' },
          { label: '执行中需求', value: '5', suffix: '个' },
          { label: '闭环沉淀资产', value: '18', suffix: '份' },
        ]"
        :key="stat.label"
        class="rounded-xl border border-border bg-surface-card p-5 shadow-card"
      >
        <p class="text-sm text-text-muted">{{ stat.label }}</p>
        <p class="mt-1 text-2xl font-bold text-text-primary">
          {{ stat.value }}
          <span class="text-sm font-normal text-slate-400">{{ stat.suffix }}</span>
        </p>
      </div>
    </div>

    <h2 class="pt-1 text-lg font-semibold text-text-primary">需求状态看板</h2>
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-4">
      <section class="min-h-[360px] rounded-xl border border-slate-200/70 bg-slate-100/60 p-4">
        <header class="mb-3 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-slate-700">对话/AI 生成中</h3>
          <span class="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">1</span>
        </header>
        <div class="rounded-lg border border-slate-200 border-l-4 border-l-blue-500 bg-white p-4 shadow-sm">
          <p class="text-[11px] text-slate-500">REQ-2026-0301</p>
          <p class="mt-2 text-sm font-medium text-slate-800">首页控制台改版与数据驾驶舱设计</p>
          <div class="mt-3 h-1.5 rounded-full bg-slate-100">
            <div class="h-1.5 w-3/5 rounded-full bg-blue-500"></div>
          </div>
        </div>
      </section>

      <section class="min-h-[360px] rounded-xl border border-amber-100 bg-amber-50/40 p-4">
        <header class="mb-3 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-slate-700">待审查 / 待评审</h3>
          <span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">2</span>
        </header>
        <div class="rounded-lg border border-slate-200 border-l-4 border-l-warning bg-white p-4 shadow-sm">
          <p class="text-[11px] text-slate-500">REQ-2026-0305</p>
          <p class="mt-2 text-sm font-medium text-slate-800">积分大转盘营销功能闭环</p>
          <p class="mt-3 text-xs text-amber-700">等待你审批 PRD 与原型方案</p>
        </div>
      </section>

      <section class="min-h-[360px] rounded-xl border border-slate-200/70 bg-slate-100/60 p-4">
        <header class="mb-3 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-slate-700">任务执行中</h3>
          <span class="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">3</span>
        </header>
        <div class="rounded-lg border border-slate-200 border-l-4 border-l-indigo-500 bg-white p-4 shadow-sm">
          <p class="text-[11px] text-slate-500">REQ-2026-0228</p>
          <p class="mt-2 text-sm font-medium text-slate-800">订单导出性能优化</p>
          <p class="mt-3 text-xs text-slate-500">进度自动同步自 GitLab / 测试平台</p>
        </div>
      </section>

      <section class="min-h-[360px] rounded-xl border border-slate-200/70 bg-slate-100/60 p-4">
        <header class="mb-3 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-slate-700">已验收 / 沉淀</h3>
          <span class="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">12</span>
        </header>
        <div class="rounded-lg border border-slate-200 border-l-4 border-l-success bg-white p-4 shadow-sm">
          <p class="text-sm font-medium text-slate-500 line-through">发票管理模块重构</p>
          <span class="mt-3 inline-block rounded border border-green-100 bg-green-50 px-2 py-0.5 text-[10px] text-success">
            资产已归档
          </span>
        </div>
      </section>
    </div>

    <div class="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-14">
      <div class="rounded-full bg-primary-50 p-4">
        <PlusIcon class="h-7 w-7 text-primary-600" />
      </div>
      <h3 class="mt-4 text-lg font-medium text-text-primary">继续发起新需求</h3>
      <p class="mt-1 text-sm text-text-muted">通过对话输入业务目标，自动生成 PRD 和执行流转</p>
    </div>
  </div>
</template>
