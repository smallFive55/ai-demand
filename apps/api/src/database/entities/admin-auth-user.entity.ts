import { Column, Entity, PrimaryColumn } from 'typeorm'

@Entity('admin_auth_users')
export class AdminAuthUserEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string

  @Column({ type: 'varchar', length: 128, unique: true })
  username!: string

  @Column({ name: 'display_name', type: 'varchar', length: 128 })
  displayName!: string

  @Column({ name: 'role_name', type: 'varchar', length: 64, default: 'admin' })
  roleName!: string

  @Column({ type: 'enum', enum: ['enabled', 'disabled'] })
  status!: 'enabled' | 'disabled'

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string

  @Column({ name: 'password_salt', type: 'varchar', length: 64 })
  passwordSalt!: string

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt!: Date

  @Column({ name: 'updated_at', type: 'datetime', precision: 3 })
  updatedAt!: Date
}
