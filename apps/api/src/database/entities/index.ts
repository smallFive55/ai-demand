import { AdminAccountEntity } from './admin-account.entity'
import { AdminAuthUserEntity } from './admin-auth-user.entity'
import { AdminRoleEntity } from './admin-role.entity'
import { AuditEventEntity } from './audit-event.entity'
import { BusinessUnitEntity } from './business-unit.entity'
import { RequirementFieldSnapshotEntity } from './requirement-field-snapshot.entity'
import { RequirementMessageEntity } from './requirement-message.entity'
import { PasswordResetTokenEntity } from './password-reset-token.entity'
import { RequirementEntity } from './requirement.entity'

export const ALL_TYPEORM_ENTITIES = [
  AdminAuthUserEntity,
  AdminRoleEntity,
  AdminAccountEntity,
  AuditEventEntity,
  BusinessUnitEntity,
  PasswordResetTokenEntity,
  RequirementEntity,
  RequirementMessageEntity,
  RequirementFieldSnapshotEntity,
] as const

export {
  AdminAccountEntity,
  AdminAuthUserEntity,
  AdminRoleEntity,
  AuditEventEntity,
  BusinessUnitEntity,
  PasswordResetTokenEntity,
  RequirementEntity,
  RequirementMessageEntity,
  RequirementFieldSnapshotEntity,
}
