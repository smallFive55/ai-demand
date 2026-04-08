import { ref } from 'vue'
import { defineStore } from 'pinia'

export type RequirementStatus =
  | 'collecting'
  | 'received'
  | 'pending_manager_review'
  | 'pending_business_review'
  | 'pending_task_approval'
  | 'in_development'
  | 'ai_executing'
  | 'pending_delivery_approval'
  | 'pending_acceptance'
  | 'accepted'
  | 'pending_follow_up'
  | 'reviewed'
  | 'abandoned'

export interface Requirement {
  id: string
  title: string
  status: RequirementStatus
  projectId?: string
  submitterId: string
  deliveryManagerId?: string
  createdAt: string
  updatedAt: string
}

export const useRequirementStore = defineStore('requirement', () => {
  const requirements = ref<Requirement[]>([])
  const currentRequirement = ref<Requirement | null>(null)
  const loading = ref(false)

  async function fetchRequirements() {
    loading.value = true
    try {
      // TODO: API integration
      requirements.value = []
    } finally {
      loading.value = false
    }
  }

  async function fetchRequirement(id: string) {
    loading.value = true
    try {
      // TODO: API integration
      currentRequirement.value = requirements.value.find((r) => r.id === id) ?? null
    } finally {
      loading.value = false
    }
  }

  return { requirements, currentRequirement, loading, fetchRequirements, fetchRequirement }
})
