import { api } from '@/api/client'
import type {
  BusinessUnit,
  CreateBusinessUnitPayload,
  UpdateBusinessUnitPayload,
} from './types'

export type { BusinessUnit }

export const businessUnitsApi = {
  list: () => api.get<BusinessUnit[]>('/admin/business-units'),
  listEnabled: () => api.get<BusinessUnit[]>('/admin/business-units/enabled'),
  getById: (id: string) => api.get<BusinessUnit>(`/admin/business-units/${id}`),
  create: (payload: CreateBusinessUnitPayload) =>
    api.post<BusinessUnit>('/admin/business-units', payload),
  update: (id: string, payload: UpdateBusinessUnitPayload) =>
    api.put<BusinessUnit>(`/admin/business-units/${id}`, payload),
  disable: (id: string) => api.post<BusinessUnit>(`/admin/business-units/${id}/disable`),
  enable: (id: string) => api.post<BusinessUnit>(`/admin/business-units/${id}/enable`),
}
