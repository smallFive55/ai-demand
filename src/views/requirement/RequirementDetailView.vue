<script setup lang="ts">
defineProps<{ id: string }>()
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <h1 class="text-xl font-bold text-text-primary">需求详情</h1>
    <div class="rounded-xl border border-border bg-surface-card p-6">
      <p class="text-sm text-text-muted">需求 ID: {{ id }}</p>
      <!-- TODO: PRD 预览 + 审批面板 + 状态时间线 -->
    </div>
  </div>
</template>
