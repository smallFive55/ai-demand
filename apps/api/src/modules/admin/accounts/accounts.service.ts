import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'crypto'
import { Repository } from 'typeorm'
import { hashPassword, newPasswordSalt } from '../../../common/crypto/password-hash'
import { AdminAccountEntity } from '../../../database/entities/admin-account.entity'
import { AdminAuthUserEntity } from '../../../database/entities/admin-auth-user.entity'
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

function redactCreateInput(input: CreateAccountInput): Record<string, unknown> {
  return {
    name: input.name,
    email: input.email,
    roleId: input.roleId,
    ...(input.password ? { password: '[redacted]' } : {}),
  }
}

type CreateAccountOptions = {
  /** 为 true 时仅创建组织账号，不要求密码、不写 admin_auth_users（用于批量导入未带密码的行） */
  skipLogin?: boolean
}

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(AdminAccountEntity)
    private readonly accountRepo: Repository<AdminAccountEntity>,
    @InjectRepository(AdminAuthUserEntity)
    private readonly authUserRepo: Repository<AdminAuthUserEntity>,
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

  async create(
    input: CreateAccountInput,
    actor: string,
    requestId: string,
    options?: CreateAccountOptions,
  ): Promise<Account> {
    const skipLogin = options?.skipLogin === true
    const password = input.password?.trim() ?? ''

    try {
      const roleId = await this.resolveEnabledRoleId(input.roleId)
      const role = await this.rolesService.getById(roleId)
      if (!role) {
        throw new BadRequestException('角色不存在，禁止使用悬空 roleId')
      }

      if (!skipLogin) {
        if (!password) {
          throw new BadRequestException('请设置登录密码')
        }
        if (password.length < 8) {
          throw new BadRequestException('登录密码长度至少 8 位')
        }
        await this.ensureAuthUsernameAvailable(input.email)
      }

      await this.ensureEmailUnique(input.email)

      const now = new Date()
      const accountId = randomUUID()
      const emailNorm = input.email.trim().toLowerCase()
      const account: Account = {
        id: accountId,
        name: input.name.trim(),
        email: emailNorm,
        roleId,
        status: 'enabled',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }

      if (skipLogin) {
        await this.accountRepo.save({
          id: account.id,
          name: account.name,
          email: account.email,
          roleId: account.roleId,
          status: account.status,
          createdAt: now,
          updatedAt: now,
        })
      } else {
        const salt = newPasswordSalt()
        const pwdHash = hashPassword(password, salt)
        await this.accountRepo.manager.transaction(async (em) => {
          await em.save(AdminAccountEntity, {
            id: account.id,
            name: account.name,
            email: account.email,
            roleId: account.roleId,
            status: account.status,
            createdAt: now,
            updatedAt: now,
          })
          await em.save(AdminAuthUserEntity, {
            id: account.id,
            username: emailNorm,
            displayName: account.name,
            roleName: role.name,
            status: 'enabled',
            passwordHash: pwdHash,
            passwordSalt: salt,
            createdAt: now,
            updatedAt: now,
          })
        })
      }

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
        after: redactCreateInput(input),
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

      const role = await this.rolesService.getById(nextRoleId)
      if (role) {
        const authRow = await this.authUserRepo.findOne({ where: { id } })
        if (authRow) {
          await this.authUserRepo.update(id, {
            roleName: role.name,
            displayName: next.name,
            updatedAt: now,
          })
        }
      }

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
      await this.authUserRepo.update(id, { status: 'disabled', updatedAt: now })

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
        await this.create(item, actor, `${requestId}:row-${index}`, {
          skipLogin: !item.password?.trim(),
        })
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
          after: redactCreateInput(item),
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

  private async ensureAuthUsernameAvailable(email: string) {
    const username = email.trim().toLowerCase()
    const existing = await this.authUserRepo.findOne({ where: { username } })
    if (existing) {
      throw new BadRequestException('该邮箱已注册为登录用户')
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
      if (message.includes('已注册为登录用户')) {
        return 'DUPLICATE_LOGIN_USERNAME'
      }
      return 'VALIDATION_FAILED'
    }
    if (error instanceof NotFoundException) {
      return 'ACCOUNT_NOT_FOUND'
    }
    return 'IMPORT_FAILED'
  }
}
