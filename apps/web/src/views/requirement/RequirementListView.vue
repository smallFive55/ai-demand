<script setup lang="ts">
import { useRouter } from 'vue-router'
import { PlusIcon, FunnelIcon } from '@heroicons/vue/24/outline'

const router = useRouter()
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-text-primary">需求列表</h1>
        <p class="mt-1 text-sm text-text-muted">全量追踪需求状态与审批进度</p>
      </div>
      <div class="flex items-center gap-3">
        <button class="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-sm text-text-muted transition hover:bg-slate-50">
          <FunnelIcon class="h-4 w-4" />
          筛选
        </button>
        <button
          class="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-text-inverse transition hover:bg-primary-700"
          @click="router.push('/requirement/new')"
        >
          <PlusIcon class="h-4 w-4" />
          提交需求
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
      <div
        v-for="item in [
          { label: '待受理', value: '0' },
          { label: '待评审', value: '0' },
          { label: '执行中', value: '0' },
          { label: '已闭环', value: '0' },
        ]"
        :key="item.label"
        class="rounded-xl border border-border bg-white p-4 shadow-card"
      >
        <p class="text-xs text-text-muted">{{ item.label }}</p>
        <p class="mt-1 text-2xl font-bold text-text-primary">{{ item.value }}</p>
      </div>
    </div>

    <div class="rounded-xl border border-border bg-white shadow-card">
      <div class="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 class="text-sm font-semibold text-text-primary">需求清单</h2>
        <span class="text-xs text-text-muted">共 0 项</span>
      </div>
      <div class="flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center">
        <p class="text-base font-medium text-text-primary">暂无需求数据</p>
        <p class="mt-2 text-sm text-text-muted">先提交一个需求，系统将自动生成 PRD 与审批流</p>
        <button
          class="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-primary-700"
          @click="router.push('/requirement/new')"
        >
          <PlusIcon class="h-4 w-4" />
          立即提交
        </button>
      </div>
    </div>
  </div>
</template>
