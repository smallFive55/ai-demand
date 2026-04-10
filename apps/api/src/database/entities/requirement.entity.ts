import { Column, Entity, PrimaryColumn } from 'typeorm'

@Entity('requirements')
export class RequirementEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string

  @Column({ type: 'varchar', length: 255 })
  title!: string

  @Column({ type: 'varchar', length: 48, default: 'collecting' })
  status!: string

  @Column({ name: 'submitter_id', type: 'varchar', length: 64 })
  submitterId!: string

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt!: Date

  @Column({ name: 'updated_at', type: 'datetime', precision: 3 })
  updatedAt!: Date
}
