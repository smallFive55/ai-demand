import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

@Entity('password_reset_tokens')
@Index('idx_password_reset_tokens_user_id', ['userId'])
export class PasswordResetTokenEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string

  @Column({ name: 'user_id', type: 'varchar', length: 64 })
  userId!: string

  @Column({ name: 'token_hash', type: 'varchar', length: 64, unique: true })
  tokenHash!: string

  @Column({ name: 'expires_at', type: 'datetime', precision: 3 })
  expiresAt!: Date

  @Column({ name: 'used_at', type: 'datetime', precision: 3, nullable: true })
  usedAt!: Date | null

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt!: Date
}
