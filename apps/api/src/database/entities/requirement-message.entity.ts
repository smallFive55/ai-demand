import { Column, Entity, PrimaryColumn } from 'typeorm'

@Entity('requirement_messages')
export class RequirementMessageEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string

  @Column({ name: 'requirement_id', type: 'varchar', length: 36 })
  requirementId!: string

  @Column({ type: 'varchar', length: 16 })
  role!: 'user' | 'ai' | 'system'

  @Column({ type: 'text' })
  content!: string

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt!: Date
}
