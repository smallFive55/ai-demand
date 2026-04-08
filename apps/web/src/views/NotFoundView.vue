<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center">
    <h1 class="text-6xl font-bold text-primary-200">404</h1>
    <p class="mt-4 text-lg text-text-muted">页面不存在</p>
    <button
      class="mt-6 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary-700 transition-colors"
      @click="router.push('/')"
    >
      返回工作台
    </button>
  </div>
</template>
