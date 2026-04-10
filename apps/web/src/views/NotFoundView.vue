<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="flex h-full items-center justify-center">
    <div class="w-full max-w-lg rounded-2xl border border-border bg-white p-10 text-center shadow-card">
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Error</p>
      <h1 class="mt-2 text-6xl font-bold text-primary-200">404</h1>
      <p class="mt-4 text-lg text-text-primary">页面不存在</p>
      <p class="mt-1 text-sm text-text-muted">可能已被移动或链接失效</p>
      <button
        class="mt-6 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-text-inverse transition hover:bg-primary-700"
        @click="router.push('/')"
      >
        返回工作台
      </button>
    </div>
  </div>
</template>
