import { ref } from 'vue'
import { defineStore } from 'pinia'
import { intakeApi } from '@/features/intake/api'
import type { Requirement } from '@ai-demand/contracts'

export const useRequirementStore = defineStore('requirement', () => {
  const requirements = ref<Requirement[]>([])
  const currentRequirement = ref<Requirement | null>(null)
  const loading = ref(false)

  async function fetchRequirements() {
    loading.value = true
    try {
      // 列表聚合 API 将在后续故事接入；本故事仅保证类型与接待详情一致
      requirements.value = []
    } finally {
      loading.value = false
    }
  }

  async function fetchRequirement(id: string) {
    loading.value = true
    try {
      currentRequirement.value = await intakeApi.getRequirement(id)
    } finally {
      loading.value = false
    }
  }

  return { requirements, currentRequirement, loading, fetchRequirements, fetchRequirement }
})
