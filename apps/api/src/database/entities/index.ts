import { AdminAccountEntity } from './admin-account.entity'
import { AdminAuthUserEntity } from './admin-auth-user.entity'
import { AdminRoleEntity } from './admin-role.entity'
import { AuditEventEntity } from './audit-event.entity'
import { BusinessUnitEntity } from './business-unit.entity'

export const ALL_TYPEORM_ENTITIES = [
  AdminAuthUserEntity,
  AdminRoleEntity,
  AdminAccountEntity,
  AuditEventEntity,
  BusinessUnitEntity,
] as const

export {
  AdminAccountEntity,
  AdminAuthUserEntity,
  AdminRoleEntity,
  AuditEventEntity,
  BusinessUnitEntity,
}
