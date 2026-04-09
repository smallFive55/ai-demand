import type {
  AdminRole,
  CreateRolePayload,
  PermissionEntry,
  UpdateRolePayload,
} from '@ai-demand/contracts'

export type Role = AdminRole
export type CreateRoleInput = CreateRolePayload
export type UpdateRoleInput = UpdateRolePayload
export type { PermissionEntry }
