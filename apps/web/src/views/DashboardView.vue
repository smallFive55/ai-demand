<script setup lang="ts">
import { PlusIcon } from '@heroicons/vue/24/solid'
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-8">
    <!-- Hero -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-text-primary">工作台</h1>
        <p class="mt-1 text-sm text-text-muted">欢迎回来，查看你的待办事项与需求动态</p>
      </div>
      <button
        class="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-text-inverse shadow-sm hover:bg-primary-700 transition-colors"
        @click="router.push('/requirement/new')"
      >
        <PlusIcon class="h-4 w-4" />
        提交需求
      </button>
    </div>

    <!-- Stats placeholder -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div
        v-for="stat in [
          { label: '待处理', value: '0', color: 'text-warning' },
          { label: '进行中', value: '0', color: 'text-info' },
          { label: '已完成', value: '0', color: 'text-success' },
          { label: '总需求', value: '0', color: 'text-text-primary' },
        ]"
        :key="stat.label"
        class="rounded-xl border border-border bg-surface-card p-5 shadow-card"
      >
        <p class="text-sm text-text-muted">{{ stat.label }}</p>
        <p class="mt-1 text-3xl font-bold" :class="stat.color">{{ stat.value }}</p>
      </div>
    </div>

    <!-- Empty state -->
    <div class="flex flex-col items-center justify-center rounded-xl border border-border bg-surface-card py-16">
      <div class="rounded-full bg-primary-50 p-4">
        <PlusIcon class="h-8 w-8 text-primary-500" />
      </div>
      <h3 class="mt-4 text-lg font-medium text-text-primary">还没有需求</h3>
      <p class="mt-1 text-sm text-text-muted">点击「提交需求」开始与 AI 对话，描述你的业务需求</p>
    </div>
  </div>
</template>
