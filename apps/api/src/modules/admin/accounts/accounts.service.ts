import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { AuditService } from '../../../modules/audit/audit.service'
import type {
  Account,
  CreateAccountInput,
  ImportAccountsSummary,
  ImportAccountResult,
  UpdateAccountInput,
} from './accounts.types'

@Injectable()
export class AccountsService {
  private readonly validRoleIds = new Set(['admin', 'manager', 'viewer'])
  private readonly accounts = new Map<string, Account>()
  private readonly dataFile = resolve(
    process.cwd(),
    process.env.ACCOUNTS_DATA_FILE ?? '.runtime-data/accounts.json',
  )

  constructor(private readonly auditService: AuditService) {
    this.loadFromDisk()
  }

  list() {
    return Array.from(this.accounts.values()).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    )
  }

  create(input: CreateAccountInput, actor: string, requestId: string) {
    try {
      this.ensureRoleExists(input.roleId)
      this.ensureEmailUnique(input.email)

      const now = new Date().toISOString()
      const account: Account = {
        id: randomUUID(),
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        roleId: input.roleId,
        status: 'enabled',
        createdAt: now,
        updatedAt: now,
      }

      this.accounts.set(account.id, account)
      this.persist()
      this.auditService.record({
        action: 'create',
        actor,
        target: account.id,
        requestId,
        occurredAt: now,
        before: null,
        after: account,
        success: true,
      })
      return account
    } catch (error) {
      this.auditService.record({
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

  update(id: string, input: UpdateAccountInput, actor: string, requestId: string) {
    try {
      const current = this.accounts.get(id)
      if (!current) {
        throw new NotFoundException('账号不存在')
      }
      if (input.roleId) {
        this.ensureRoleExists(input.roleId)
      }

      const before = { ...current }
      const next: Account = {
        ...current,
        name: input.name?.trim() || current.name,
        roleId: input.roleId || current.roleId,
        updatedAt: new Date().toISOString(),
      }
      this.accounts.set(id, next)
      this.persist()
      this.auditService.record({
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
      this.auditService.record({
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

  disable(id: string, actor: string, requestId: string) {
    try {
      const current = this.accounts.get(id)
      if (!current) {
        throw new NotFoundException('账号不存在')
      }

      const before = { ...current }
      const now = new Date().toISOString()
      const next: Account = {
        ...current,
        status: 'disabled',
        updatedAt: now,
      }
      this.accounts.set(id, next)
      this.persist()
      this.auditService.record({
        action: 'disable',
        actor,
        target: id,
        requestId,
        occurredAt: now,
        before,
        after: next,
        success: true,
      })
      return next
    } catch (error) {
      this.auditService.record({
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

  import(items: CreateAccountInput[], actor: string, requestId: string): ImportAccountsSummary {
    const errors: ImportAccountResult[] = []
    let successCount = 0

    items.forEach((item, index) => {
      try {
        this.create(item, actor, `${requestId}:row-${index}`)
        successCount += 1
      } catch (error) {
        const reasonCode = this.mapImportReasonCode(error)
        const message = error instanceof Error ? error.message : '导入失败'
        errors.push({ index, reasonCode, message })
        this.auditService.record({
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
    })

    this.auditService.record({
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

  private ensureRoleExists(roleId: string) {
    if (!this.validRoleIds.has(roleId)) {
      throw new BadRequestException('角色不存在，禁止使用悬空 roleId')
    }
  }

  private ensureEmailUnique(email: string) {
    const target = email.trim().toLowerCase()
    const duplicate = Array.from(this.accounts.values()).some(
      (account) => account.email === target,
    )
    if (duplicate) {
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
        typeof response === 'object' &&
        response !== null &&
        'message' in response
          ? String(response.message)
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

  private loadFromDisk() {
    if (!existsSync(this.dataFile)) {
      return
    }
    const raw = readFileSync(this.dataFile, 'utf8')
    if (!raw.trim()) {
      return
    }
    const parsed = JSON.parse(raw) as Account[]
    parsed.forEach((account) => {
      this.accounts.set(account.id, account)
    })
  }

  private persist() {
    mkdirSync(dirname(this.dataFile), { recursive: true })
    writeFileSync(
      this.dataFile,
      JSON.stringify(Array.from(this.accounts.values()), null, 2),
      'utf8',
    )
  }
}
