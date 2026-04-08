<script setup lang="ts">
import type { RequirementStatus } from '@/types/requirement'
import { STATUS_LABEL, STATUS_COLOR } from '@/types/requirement'

const props = defineProps<{
  status: RequirementStatus
}>()
</script>

<template>
  <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium">
    <span class="h-1.5 w-1.5 rounded-full" :class="STATUS_COLOR[props.status]" />
    {{ STATUS_LABEL[props.status] }}
  </span>
</template>
