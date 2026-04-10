import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('audit_events')
export class AuditEventEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string

  @Column({ type: 'varchar', length: 32 })
  action!: string

  @Column({ type: 'varchar', length: 128 })
  actor!: string

  @Column({ type: 'varchar', length: 512 })
  target!: string

  @Column({ name: 'request_id', type: 'varchar', length: 64 })
  requestId!: string

  @Column({ name: 'occurred_at', type: 'datetime', precision: 3 })
  occurredAt!: Date

  @Column({ name: 'before_data', type: 'json', nullable: true })
  beforeData!: unknown | null

  @Column({ name: 'after_data', type: 'json', nullable: true })
  afterData!: unknown | null

  @Column({ type: 'boolean' })
  success!: boolean

  @Column({ name: 'reason_code', type: 'varchar', length: 64, nullable: true })
  reasonCode!: string | null
}
