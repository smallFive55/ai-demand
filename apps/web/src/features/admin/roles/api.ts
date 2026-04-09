import { api } from '@/api/client'
import type {
  CreateRolePayload,
  PermissionEntry,
  Role,
  UpdateRolePayload,
} from './types'

export type { Role }

export const rolesApi = {
  list: () => api.get<Role[]>('/admin/roles'),
  getById: (id: string) => api.get<Role>(`/admin/roles/${id}`),
  create: (payload: CreateRolePayload) =>
    api.post<Role>('/admin/roles', payload),
  update: (id: string, payload: UpdateRolePayload) =>
    api.put<Role>(`/admin/roles/${id}`, payload),
  disable: (id: string) =>
    api.post<Role>(`/admin/roles/${id}/disable`),
  enable: (id: string) =>
    api.post<Role>(`/admin/roles/${id}/enable`),
  updatePermissions: (id: string, permissions: PermissionEntry[]) =>
    api.put<Role>(`/admin/roles/${id}/permissions`, { permissions }),
}
