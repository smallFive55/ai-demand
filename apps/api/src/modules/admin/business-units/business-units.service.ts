import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'crypto'
import { Repository } from 'typeorm'
import { BusinessUnitEntity } from '../../../database/entities/business-unit.entity'
import { AuditService } from '../../../modules/audit/audit.service'
import { AccountsService } from '../accounts/accounts.service'
import type { BizUnit, CreateBizUnitInput, UpdateBizUnitInput } from './business-units.types'

function unitFromEntity(e: BusinessUnitEntity): BizUnit {
  return {
    id: e.id,
    name: e.name,
    description: e.description,
    functionList: e.functionList,
    deliveryManagerId: e.deliveryManagerId,
    admissionCriteria: e.admissionCriteria,
    admissionThreshold: e.admissionThreshold,
    status: e.status,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  }
}

@Injectable()
export class BusinessUnitsService {
  constructor(
    @InjectRepository(BusinessUnitEntity)
    private readonly unitRepo: Repository<BusinessUnitEntity>,
    private readonly auditService: AuditService,
    private readonly accountsService: AccountsService,
  ) {}

  async list(): Promise<BizUnit[]> {
    const rows = await this.unitRepo.find({ order: { createdAt: 'ASC' } })
    return rows.map(unitFromEntity)
  }

  async listEnabled(): Promise<BizUnit[]> {
    const rows = await this.unitRepo.find({
      where: { status: 'enabled' },
      order: { createdAt: 'ASC' },
    })
    return rows.map(unitFromEntity)
  }

  async getById(id: string): Promise<BizUnit | undefined> {
    const e = await this.unitRepo.findOne({ where: { id } })
    return e ? unitFromEntity(e) : undefined
  }

  async getByName(name: string): Promise<BizUnit | undefined> {
    const trimmed = name.trim()
    const e = await this.unitRepo.findOne({ where: { name: trimmed } })
    return e ? unitFromEntity(e) : undefined
  }

  async create(input: CreateBizUnitInput, actor: string, requestId: string): Promise<BizUnit> {
    try {
      const name = input.name.trim()
      if (!name) {
        throw new BadRequestException('板块名称不能为空')
      }
      await this.ensureNameUnique(name)
      await this.ensureDeliveryManagerValid(input.deliveryManagerId)

      const threshold = input.admissionThreshold ?? 80
      this.ensureThreshold(threshold)
      const functionList = this.normalizeFunctionList(input.functionList, 'functionList')

      const now = new Date()
      const unit: BizUnit = {
        id: randomUUID(),
        name,
        description: (input.description ?? '').trim(),
        functionList,
        deliveryManagerId: input.deliveryManagerId,
        admissionCriteria: (input.admissionCriteria ?? '').trim(),
        admissionThreshold: Math.round(threshold),
        status: 'enabled',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }

      await this.unitRepo.save({
        id: unit.id,
        name: unit.name,
        description: unit.description,
        functionList: unit.functionList,
        deliveryManagerId: unit.deliveryManagerId,
        admissionCriteria: unit.admissionCriteria,
        admissionThreshold: unit.admissionThreshold,
        status: unit.status,
        createdAt: now,
        updatedAt: now,
      })

      await this.auditService.record({
        action: 'create',
        actor,
        target: unit.id,
        requestId,
        occurredAt: unit.createdAt,
        before: null,
        after: unit,
        success: true,
      })
      return unit
    } catch (error) {
      await this.auditService.record({
        action: 'create',
        actor,
        target: input.name,
        requestId,
        occurredAt: new Date().toISOString(),
        before: null,
        after: input,
        success: false,
        reasonCode: this.mapReasonCode(error),
      })
      throw error
    }
  }

  async update(id: string, input: UpdateBizUnitInput, actor: string, requestId: string): Promise<BizUnit> {
    try {
      const currentE = await this.unitRepo.findOne({ where: { id } })
      if (!currentE) {
        throw new NotFoundException('业务板块不存在')
      }
      const current = unitFromEntity(currentE)

      if (input.name !== undefined) {
        const nextName = input.name.trim()
        if (!nextName) {
          throw new BadRequestException('板块名称不能为空')
        }
        await this.ensureNameUnique(nextName, id)
      }

      if (input.deliveryManagerId !== undefined) {
        await this.ensureDeliveryManagerValid(input.deliveryManagerId)
      }

      if (input.admissionThreshold !== undefined) {
        this.ensureThreshold(input.admissionThreshold)
      }

      const before = { ...current }
      const now = new Date()
      const next: BizUnit = {
        ...current,
        name: input.name !== undefined ? input.name.trim() : current.name,
        description:
          input.description !== undefined ? input.description.trim() : current.description,
        functionList:
          input.functionList !== undefined
            ? this.normalizeFunctionList(input.functionList, 'functionList')
            : [...current.functionList],
        deliveryManagerId:
          input.deliveryManagerId !== undefined
            ? input.deliveryManagerId
            : current.deliveryManagerId,
        admissionCriteria:
          input.admissionCriteria !== undefined
            ? input.admissionCriteria.trim()
            : current.admissionCriteria,
        admissionThreshold:
          input.admissionThreshold !== undefined
            ? Math.round(input.admissionThreshold)
            : current.admissionThreshold,
        updatedAt: now.toISOString(),
      }

      await this.unitRepo.update(id, {
        name: next.name,
        description: next.description,
        functionList: next.functionList,
        deliveryManagerId: next.deliveryManagerId,
        admissionCriteria: next.admissionCriteria,
        admissionThreshold: next.admissionThreshold,
        updatedAt: now,
      })

      await this.auditService.record({
        action: 'update',
        actor,
        target: id,
        requestId,
        occurredAt: next.updatedAt,
        before,
        after: next,
        success: true,
      })
      return next
    } catch (error) {
      await this.auditService.record({
        action: 'update',
        actor,
        target: id,
        requestId,
        occurredAt: new Date().toISOString(),
        before: null,
        after: input,
        success: false,
        reasonCode: this.mapReasonCode(error),
      })
      throw error
    }
  }

  async disable(id: string, actor: string, requestId: string): Promise<BizUnit> {
    try {
      const currentE = await this.unitRepo.findOne({ where: { id } })
      if (!currentE) {
        throw new NotFoundException('业务板块不存在')
      }
      const current = unitFromEntity(currentE)
      const before = { ...current }
      const now = new Date()
      const next: BizUnit = {
        ...current,
        status: 'disabled',
        updatedAt: now.toISOString(),
      }

      await this.unitRepo.update(id, { status: 'disabled', updatedAt: now })

      await this.auditService.record({
        action: 'disable',
        actor,
        target: id,
        requestId,
        occurredAt: next.updatedAt,
        before,
        after: next,
        success: true,
      })
      return next
    } catch (error) {
      await this.auditService.record({
        action: 'disable',
        actor,
        target: id,
        requestId,
        occurredAt: new Date().toISOString(),
        before: null,
        after: null,
        success: false,
        reasonCode: this.mapReasonCode(error),
      })
      throw error
    }
  }

  async enable(id: string, actor: string, requestId: string): Promise<BizUnit> {
    try {
      const currentE = await this.unitRepo.findOne({ where: { id } })
      if (!currentE) {
        throw new NotFoundException('业务板块不存在')
      }
      const current = unitFromEntity(currentE)
      await this.ensureDeliveryManagerValid(current.deliveryManagerId)

      const before = { ...current }
      const now = new Date()
      const next: BizUnit = {
        ...current,
        status: 'enabled',
        updatedAt: now.toISOString(),
      }

      await this.unitRepo.update(id, { status: 'enabled', updatedAt: now })

      await this.auditService.record({
        action: 'enable',
        actor,
        target: id,
        requestId,
        occurredAt: next.updatedAt,
        before,
        after: next,
        success: true,
      })
      return next
    } catch (error) {
      await this.auditService.record({
        action: 'enable',
        actor,
        target: id,
        requestId,
        occurredAt: new Date().toISOString(),
        before: null,
        after: null,
        success: false,
        reasonCode: this.mapReasonCode(error),
      })
      throw error
    }
  }

  private async ensureNameUnique(name: string, excludeId?: string) {
    const trimmed = name.trim()
    const existing = await this.unitRepo.findOne({ where: { name: trimmed } })
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException('板块名称已存在')
    }
  }

  private async ensureDeliveryManagerValid(deliveryManagerId: string) {
    const account = await this.accountsService.getById(deliveryManagerId)
    if (!account) {
      throw new BadRequestException('交付经理账号不存在')
    }
    if (account.status !== 'enabled') {
      throw new BadRequestException('交付经理账号已禁用')
    }
  }

  private normalizeFunctionList(value: unknown, field: string): string[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${field} 必须是字符串数组`)
    }
    for (const item of value) {
      if (typeof item !== 'string') {
        throw new BadRequestException(`${field} 只能包含字符串`)
      }
    }
    return [...value]
  }

  private ensureThreshold(value: number) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new BadRequestException('匹配度阈值必须是数字')
    }
    const rounded = Math.round(value)
    if (rounded < 0 || rounded > 100) {
      throw new BadRequestException('匹配度阈值必须在 0-100 之间')
    }
  }

  private mapReasonCode(error: unknown) {
    if (error instanceof NotFoundException) {
      return 'BUSINESS_UNIT_NOT_FOUND'
    }
    if (error instanceof BadRequestException) {
      return 'VALIDATION_FAILED'
    }
    return 'UNKNOWN_ERROR'
  }
}
