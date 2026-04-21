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

  @Column({ name: 'business_unit_id', type: 'varchar', length: 36, nullable: true })
  businessUnitId!: string | null

  @Column({ name: 'project_ids', type: 'json' })
  projectIds!: string[]

  @Column({ name: 'admission_score', type: 'int', nullable: true })
  admissionScore!: number | null

  @Column({ name: 'admission_rationale', type: 'text', nullable: true })
  admissionRationale!: string | null

  @Column({ name: 'delivery_manager_id', type: 'varchar', length: 64, nullable: true })
  deliveryManagerId!: string | null

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt!: Date

  @Column({ name: 'updated_at', type: 'datetime', precision: 3 })
  updatedAt!: Date
}
