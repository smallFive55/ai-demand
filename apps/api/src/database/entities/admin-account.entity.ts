import { Column, Entity, PrimaryColumn } from 'typeorm'

@Entity('admin_accounts')
export class AdminAccountEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string

  @Column({ type: 'varchar', length: 128 })
  name!: string

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string

  @Column({ name: 'role_id', type: 'varchar', length: 36 })
  roleId!: string

  @Column({ type: 'enum', enum: ['enabled', 'disabled'] })
  status!: 'enabled' | 'disabled'

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt!: Date

  @Column({ name: 'updated_at', type: 'datetime', precision: 3 })
  updatedAt!: Date
}
