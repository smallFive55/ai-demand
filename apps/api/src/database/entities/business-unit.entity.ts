import { Column, Entity, PrimaryColumn } from 'typeorm'

@Entity('business_units')
export class BusinessUnitEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string

  @Column({ type: 'varchar', length: 255, unique: true })
  name!: string

  @Column({ type: 'text' })
  description!: string

  @Column({ name: 'function_list', type: 'json' })
  functionList!: string[]

  @Column({ name: 'delivery_manager_id', type: 'varchar', length: 36 })
  deliveryManagerId!: string

  @Column({ name: 'admission_criteria', type: 'text' })
  admissionCriteria!: string

  @Column({ name: 'admission_threshold', type: 'int' })
  admissionThreshold!: number

  @Column({ type: 'enum', enum: ['enabled', 'disabled'] })
  status!: 'enabled' | 'disabled'

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt!: Date

  @Column({ name: 'updated_at', type: 'datetime', precision: 3 })
  updatedAt!: Date
}
