import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

@Entity('requirement_field_snapshots')
@Index(['requirementId', 'version'], { unique: true })
export class RequirementFieldSnapshotEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string

  @Column({ name: 'requirement_id', type: 'varchar', length: 36 })
  requirementId!: string

  @Column({ type: 'int' })
  version!: number

  @Column({ name: 'collected_fields', type: 'json' })
  collectedFields!: Record<string, unknown>

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt!: Date
}
