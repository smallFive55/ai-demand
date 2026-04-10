import type { PermissionEntry } from '@ai-demand/contracts'
import { Column, Entity, PrimaryColumn } from 'typeorm'

@Entity('admin_roles')
export class AdminRoleEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string

  @Column({ type: 'varchar', length: 64, unique: true })
  name!: string

  @Column({ type: 'varchar', length: 512, default: '' })
  description!: string

  @Column({ type: 'enum', enum: ['enabled', 'disabled'] })
  status!: 'enabled' | 'disabled'

  @Column({ type: 'json' })
  permissions!: PermissionEntry[]

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt!: Date

  @Column({ name: 'updated_at', type: 'datetime', precision: 3 })
  updatedAt!: Date
}
