<script setup lang="ts">
import { CheckCircleIcon, ArrowPathIcon } from '@heroicons/vue/24/solid'

export interface ProgressStep {
  label: string
  status: 'pending' | 'running' | 'done' | 'error'
}

defineProps<{
  steps: ProgressStep[]
  title?: string
}>()
</script>

<template>
  <div class="rounded-xl border border-border bg-surface-card p-4">
    <h4 v-if="title" class="mb-3 text-sm font-medium text-text-primary">{{ title }}</h4>
    <ol class="space-y-3">
      <li v-for="(step, idx) in steps" :key="idx" class="flex items-center gap-3">
        <CheckCircleIcon v-if="step.status === 'done'" class="h-5 w-5 shrink-0 text-success" />
        <ArrowPathIcon v-else-if="step.status === 'running'" class="h-5 w-5 shrink-0 animate-spin text-primary-500" />
        <span
          v-else
          class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold"
          :class="step.status === 'error' ? 'border-danger text-danger' : 'border-border text-text-muted'"
        >
          {{ idx + 1 }}
        </span>
        <span
          class="text-sm"
          :class="step.status === 'done' ? 'text-text-muted line-through' : step.status === 'running' ? 'text-primary-600 font-medium' : 'text-text-muted'"
        >
          {{ step.label }}
        </span>
      </li>
    </ol>
  </div>
</template>
