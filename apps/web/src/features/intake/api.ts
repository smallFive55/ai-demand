import { api } from '@/api/client'
import type {
  AbandonRequirementPayload,
  AppendRequirementMessagePayload,
  AppendRequirementMessageResponse,
  EnabledBusinessUnitSummary,
  PatchRequirementIntakePayload,
  Requirement,
  RequirementFieldSnapshot,
  RequirementMessage,
} from '@ai-demand/contracts'

const base = '/v1/requirements'
const unitsBase = '/v1/business-units'

export const intakeApi = {
  createRequirement: () => api.post<Requirement>(base),

  getRequirement: (id: string) => api.get<Requirement>(`${base}/${id}`),

  listMessages: (id: string, limit?: number) =>
    api.get<RequirementMessage[]>(`${base}/${id}/messages${limit != null ? `?limit=${limit}` : ''}`),

  listFieldSnapshots: (id: string) =>
    api.get<RequirementFieldSnapshot[]>(`${base}/${id}/field-snapshots`),

  appendMessage: (id: string, payload: AppendRequirementMessagePayload) =>
    api.post<AppendRequirementMessageResponse>(`${base}/${id}/messages`, payload),

  listEnabledBusinessUnits: () => api.get<EnabledBusinessUnitSummary[]>(`${unitsBase}/enabled`),

  patchIntake: (id: string, payload: PatchRequirementIntakePayload) =>
    api.patch<Requirement>(`${base}/${id}/intake`, payload),

  abandonRequirement: (id: string, payload: AbandonRequirementPayload = {}) =>
    api.patch<Requirement>(`${base}/${id}/abandon`, payload),
}
