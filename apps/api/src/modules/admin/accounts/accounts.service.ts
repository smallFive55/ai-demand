import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'crypto'
import { Repository } from 'typeorm'
import { AdminAccountEntity } from '../../../database/entities/admin-account.entity'
import { AuditService } from '../../../modules/audit/audit.service'
import { RolesService } from '../roles/roles.service'
import type {
  Account,
  CreateAccountInput,
  ImportAccountsSummary,
  ImportAccountResult,
  UpdateAccountInput,
} from './accounts.types'

function accountFromEntity(e: AdminAccountEntity): Account {
  return {
    id: e.id,
    name: e.name,
    email: e.email,
    roleId: e.roleId,
    status: e.status,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  }
}

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(AdminAccountEntity)
    private readonly accountRepo: Repository<AdminAccountEntity>,
    private readonly auditService: AuditService,
    private readonly rolesService: RolesService,
  ) {}

  async list(): Promise<Account[]> {
    const rows = await this.accountRepo.find({ order: { createdAt: 'ASC' } })
    return rows.map(accountFromEntity)
  }

  async getById(id: string): Promise<Account | undefined> {
    const e = await this.accountRepo.findOne({ where: { id } })
    return e ? accountFromEntity(e) : undefined
  }

  async create(input: CreateAccountInput, actor: string, requestId: string): Promise<Account> {
    try {
      const roleId = await this.resolveEnabledRoleId(input.roleId)
      await this.ensureEmailUnique(input.email)

      const now = new Date()
      const account: Account = {
        id: randomUUID(),
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        roleId,
        status: 'enabled',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }

      await this.accountRepo.save({
        id: account.id,
        name: account.name,
        email: account.email,
        roleId: account.roleId,
        status: account.status,
        createdAt: now,
        updatedAt: now,
      })

      await this.auditService.record({
        action: 'create',
        actor,
        target: account.id,
        requestId,
        occurredAt: account.createdAt,
        before: null,
        after: account,
        success: true,
      })
      return account
    } catch (error) {
      await this.auditService.record({
        action: 'create',
        actor,
        target: input.email,
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

  async update(id: string, input: UpdateAccountInput, actor: string, requestId: string): Promise<Account> {
    try {
      const currentE = await this.accountRepo.findOne({ where: { id } })
      if (!currentE) {
        throw new NotFoundException('账号不存在')
      }
      const current = accountFromEntity(currentE)
      const before = { ...current }
      const now = new Date()
      const nextRoleId = input.roleId
        ? await this.resolveEnabledRoleId(input.roleId)
        : current.roleId
      const next: Account = {
        ...current,
        name: input.name?.trim() || current.name,
        roleId: nextRoleId,
        updatedAt: now.toISOString(),
      }

      await this.accountRepo.update(id, {
        name: next.name,
        roleId: next.roleId,
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

  async disable(id: string, actor: string, requestId: string): Promise<Account> {
    try {
      const currentE = await this.accountRepo.findOne({ where: { id } })
      if (!currentE) {
        throw new NotFoundException('账号不存在')
      }
      const current = accountFromEntity(currentE)
      const before = { ...current }
      const now = new Date()
      const next: Account = {
        ...current,
        status: 'disabled',
        updatedAt: now.toISOString(),
      }

      await this.accountRepo.update(id, { status: 'disabled', updatedAt: now })

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

  async import(items: CreateAccountInput[], actor: string, requestId: string): Promise<ImportAccountsSummary> {
    const errors: ImportAccountResult[] = []
    let successCount = 0

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
      try {
        await this.create(item, actor, `${requestId}:row-${index}`)
        successCount += 1
      } catch (error) {
        const reasonCode = this.mapImportReasonCode(error)
        const message = error instanceof Error ? error.message : '导入失败'
        errors.push({ index, reasonCode, message })
        await this.auditService.record({
          action: 'import',
          actor,
          target: item.email,
          requestId,
          occurredAt: new Date().toISOString(),
          before: null,
          after: item,
          success: false,
          reasonCode,
        })
      }
    }

    await this.auditService.record({
      action: 'import',
      actor,
      target: `batch:${requestId}`,
      requestId,
      occurredAt: new Date().toISOString(),
      before: null,
      after: {
        total: items.length,
        successCount,
        failureCount: errors.length,
      },
      success: errors.length === 0,
      reasonCode: errors.length > 0 ? 'PARTIAL_FAILURE' : undefined,
    })

    return {
      successCount,
      failureCount: errors.length,
      errors,
    }
  }

  /** 接受角色 UUID 或角色名（如 admin / manager），统一解析为 UUID 以满足外键 */
  private async resolveEnabledRoleId(roleIdOrName: string): Promise<string> {
    const trimmed = roleIdOrName.trim()
    let role = await this.rolesService.getById(trimmed)
    if (role) {
      if (role.status !== 'enabled') {
        throw new BadRequestException('角色已禁用，禁止关联')
      }
      return role.id
    }
    role = await this.rolesService.getByName(trimmed)
    if (role && role.status === 'enabled') {
      return role.id
    }
    throw new BadRequestException('角色不存在，禁止使用悬空 roleId')
  }

  private async ensureEmailUnique(email: string) {
    const target = email.trim().toLowerCase()
    const existing = await this.accountRepo.findOne({ where: { email: target } })
    if (existing) {
      throw new BadRequestException('账号邮箱已存在')
    }
  }

  private mapReasonCode(error: unknown) {
    if (error instanceof NotFoundException) {
      return 'ACCOUNT_NOT_FOUND'
    }
    if (error instanceof BadRequestException) {
      return 'VALIDATION_FAILED'
    }
    return 'UNKNOWN_ERROR'
  }

  private mapImportReasonCode(error: unknown) {
    if (error instanceof BadRequestException) {
      const response = error.getResponse()
      const message =
        typeof response === 'object' && response !== null && 'message' in response
          ? String((response as { message: unknown }).message)
          : error.message
      if (message.includes('角色不存在')) {
        return 'ROLE_NOT_FOUND'
      }
      if (message.includes('账号邮箱已存在')) {
        return 'DUPLICATE_EMAIL'
      }
      return 'VALIDATION_FAILED'
    }
    if (error instanceof NotFoundException) {
      return 'ACCOUNT_NOT_FOUND'
    }
    return 'IMPORT_FAILED'
  }
}
