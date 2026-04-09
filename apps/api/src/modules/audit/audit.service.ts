import { Injectable } from '@nestjs/common'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'

export interface AuditEvent {
  action: 'create' | 'update' | 'disable' | 'import' | 'enable' | 'permission_change'
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
  private readonly events: AuditEvent[] = []
  private readonly dataFile = resolve(
    process.cwd(),
    process.env.AUDIT_DATA_FILE ?? '.runtime-data/audit-events.json',
  )

  constructor() {
    this.loadFromDisk()
  }

  record(event: AuditEvent) {
    this.events.push(event)
    this.persist()
  }

  list(requestId?: string) {
    if (!requestId) {
      return [...this.events]
    }
    return this.events.filter((event) => event.requestId === requestId)
  }

  private loadFromDisk() {
    if (!existsSync(this.dataFile)) {
      return
    }
    const raw = readFileSync(this.dataFile, 'utf8')
    if (!raw.trim()) {
      return
    }
    const parsed = JSON.parse(raw) as AuditEvent[]
    this.events.push(...parsed)
  }

  private persist() {
    mkdirSync(dirname(this.dataFile), { recursive: true })
    writeFileSync(this.dataFile, JSON.stringify(this.events, null, 2), 'utf8')
  }
}
