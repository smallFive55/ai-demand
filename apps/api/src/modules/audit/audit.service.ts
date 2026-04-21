import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AuditEventEntity } from '../../database/entities/audit-event.entity'

export interface AuditEvent {
  action:
    | 'create'
    | 'update'
    | 'disable'
    | 'import'
    | 'enable'
    | 'permission_change'
    | 'requirement_create'
    | 'requirement_message'
    | 'requirement_field_snapshot'
    | 'requirement_llm_failed'
    | 'requirement_intake_assessed'
    | 'requirement_intake_manual_unit'
    | 'requirement_intake_below_threshold'
    | 'requirement_status_change'
    | 'requirement_abandoned'
  actor: string
  target: string
  requestId: string
  occurredAt: string
  before: unknown
  after: unknown
  success: boolean
  reasonCode?: string
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditEventEntity)
    private readonly repo: Repository<AuditEventEntity>,
  ) {}

  async record(event: AuditEvent): Promise<void> {
    const row = this.repo.create({
      action: event.action,
      actor: event.actor,
      target: event.target,
      requestId: event.requestId,
      occurredAt: new Date(event.occurredAt),
      beforeData: event.before,
      afterData: event.after,
      success: event.success,
      reasonCode: event.reasonCode ?? null,
    })
    await this.repo.save(row)
  }

  async list(requestId?: string): Promise<AuditEvent[]> {
    const qb = this.repo.createQueryBuilder('e').orderBy('e.id', 'ASC')
    if (requestId) {
      qb.where('e.requestId = :rid', { rid: requestId })
    }
    const rows = await qb.getMany()
    return rows.map((r) => ({
      action: r.action as AuditEvent['action'],
      actor: r.actor,
      target: r.target,
      requestId: r.requestId,
      occurredAt: r.occurredAt.toISOString(),
      before: r.beforeData,
      after: r.afterData,
      success: r.success,
      reasonCode: r.reasonCode ?? undefined,
    }))
  }
}
