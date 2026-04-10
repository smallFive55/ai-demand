import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'crypto'
import { Repository } from 'typeorm'
import { AdminRoleEntity } from '../../../database/entities/admin-role.entity'
import { AuditService } from '../../../modules/audit/audit.service'
import type { CreateRoleInput, PermissionEntry, Role, UpdateRoleInput } from './roles.types'

const DEFAULT_ROLES: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'admin',
    description: '系统管理员，拥有全部管理权限',
    status: 'enabled',
    permissions: [
      { resource: 'admin.role', actions: ['read', 'manage'], scope: { type: 'all' } },
      { resource: 'admin.account', actions: ['read', 'create', 'update', 'disable', 'import'], scope: { type: 'all' } },
      {
        resource: 'admin.businessUnit',
        actions: ['read', 'create', 'update', 'disable', 'enable'],
        scope: { type: 'all' },
      },
    ],
  },
  {
    name: 'manager',
    description: '业务经理，拥有业务数据读写权限',
    status: 'enabled',
    permissions: [{ resource: 'admin.account', actions: ['read'], scope: { type: 'all' } }],
  },
  {
    name: 'viewer',
    description: '只读查看者，仅拥有查看权限',
    status: 'enabled',
    permissions: [{ resource: 'admin.account', actions: ['read'], scope: { type: 'all' } }],
  },
  {
    name: 'business',
    description: '业务方：可发起对话式需求；无系统管理后台权限（需求接口仅校验登录角色名）',
    status: 'enabled',
    permissions: [],
  },
]

function roleFromEntity(e: AdminRoleEntity): Role {
  return {
    id: e.id,
    name: e.name,
    description: e.description,
    status: e.status,
    permissions: e.permissions,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  }
}

@Injectable()
export class RolesService implements OnModuleInit {
  constructor(
    @InjectRepository(AdminRoleEntity)
    private readonly roleRepo: Repository<AdminRoleEntity>,
    private readonly auditService: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaults()
  }

  async list(): Promise<Role[]> {
    const rows = await this.roleRepo.find({ order: { createdAt: 'ASC' } })
    return rows.map(roleFromEntity)
  }

  async getById(id: string): Promise<Role | undefined> {
    const e = await this.roleRepo.findOne({ where: { id } })
    return e ? roleFromEntity(e) : undefined
  }

  async getByName(name: string): Promise<Role | undefined> {
    const e = await this.roleRepo.findOne({ where: { name: name.trim() } })
    return e ? roleFromEntity(e) : undefined
  }

  async exists(id: string): Promise<boolean> {
    const role = await this.roleRepo.findOne({ where: { id } })
    return !!role && role.status === 'enabled'
  }

  async create(input: CreateRoleInput, actor: string, requestId: string): Promise<Role> {
    try {
      await this.ensureNameUnique(input.name)
      if (input.permissions) {
        this.validatePermissions(input.permissions)
      }

      const now = new Date()
      const role: Role = {
        id: randomUUID(),
        name: input.name.trim(),
        description: (input.description ?? '').trim(),
        status: 'enabled',
        permissions: input.permissions ?? [],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }

      await this.roleRepo.save({
        id: role.id,
        name: role.name,
        description: role.description,
        status: role.status,
        permissions: role.permissions,
        createdAt: now,
        updatedAt: now,
      })

      await this.auditService.record({
        action: 'create',
        actor,
        target: role.id,
        requestId,
        occurredAt: role.createdAt,
        before: null,
        after: role,
        success: true,
      })
      return role
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

  async update(id: string, input: UpdateRoleInput, actor: string, requestId: string): Promise<Role> {
    try {
      const currentE = await this.roleRepo.findOne({ where: { id } })
      if (!currentE) {
        throw new NotFoundException('角色不存在')
      }
      const current = roleFromEntity(currentE)
      if (input.name && input.name !== current.name) {
        await this.ensureNameUnique(input.name)
      }
      if (input.permissions) {
        this.validatePermissions(input.permissions)
      }

      const before = { ...current, permissions: [...current.permissions] }
      const now = new Date()
      const next: Role = {
        ...current,
        name: input.name?.trim() ?? current.name,
        description: input.description?.trim() ?? current.description,
        permissions: input.permissions ?? current.permissions,
        updatedAt: now.toISOString(),
      }

      await this.roleRepo.update(id, {
        name: next.name,
        description: next.description,
        permissions: next.permissions,
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

  async disable(id: string, actor: string, requestId: string): Promise<Role> {
    try {
      const currentE = await this.roleRepo.findOne({ where: { id } })
      if (!currentE) {
        throw new NotFoundException('角色不存在')
      }
      const current = roleFromEntity(currentE)
      const before = { ...current }
      const now = new Date()
      const next: Role = {
        ...current,
        status: 'disabled',
        updatedAt: now.toISOString(),
      }

      await this.roleRepo.update(id, { status: 'disabled', updatedAt: now })

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

  async enable(id: string, actor: string, requestId: string): Promise<Role> {
    try {
      const currentE = await this.roleRepo.findOne({ where: { id } })
      if (!currentE) {
        throw new NotFoundException('角色不存在')
      }
      const current = roleFromEntity(currentE)
      const before = { ...current }
      const now = new Date()
      const next: Role = {
        ...current,
        status: 'enabled',
        updatedAt: now.toISOString(),
      }

      await this.roleRepo.update(id, { status: 'enabled', updatedAt: now })

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

  async updatePermissions(
    id: string,
    permissions: PermissionEntry[],
    actor: string,
    requestId: string,
  ): Promise<Role> {
    try {
      const currentE = await this.roleRepo.findOne({ where: { id } })
      if (!currentE) {
        throw new NotFoundException('角色不存在')
      }
      const current = roleFromEntity(currentE)
      this.validatePermissions(permissions)

      const before = { ...current, permissions: [...current.permissions] }
      const now = new Date()
      const next: Role = {
        ...current,
        permissions,
        updatedAt: now.toISOString(),
      }

      await this.roleRepo.update(id, { permissions, updatedAt: now })

      await this.auditService.record({
        action: 'permission_change',
        actor,
        target: id,
        requestId,
        occurredAt: next.updatedAt,
        before: before.permissions,
        after: next.permissions,
        success: true,
      })
      return next
    } catch (error) {
      await this.auditService.record({
        action: 'permission_change',
        actor,
        target: id,
        requestId,
        occurredAt: new Date().toISOString(),
        before: null,
        after: permissions,
        success: false,
        reasonCode: this.mapReasonCode(error),
      })
      throw error
    }
  }

  /** 基于已加载角色对象校验权限（避免重复查库） */
  roleAllowsPermission(
    role: Role,
    resource: string,
    action: string,
    scopeCtx?: { type: string; id: string },
  ): boolean {
    if (!role || role.status !== 'enabled') return false

    return role.permissions.some((entry) => {
      if (entry.resource !== resource) return false
      if (!entry.actions.includes(action)) return false
      if (!scopeCtx) return true
      if (entry.scope.type === 'all') return true
      if (entry.scope.type !== scopeCtx.type) return false
      if (!entry.scope.ids || entry.scope.ids.length === 0) return true
      return entry.scope.ids.includes(scopeCtx.id)
    })
  }

  async hasPermission(
    roleId: string,
    resource: string,
    action: string,
    scopeCtx?: { type: string; id: string },
  ): Promise<boolean> {
    const role = await this.getById(roleId)
    if (!role) return false
    return this.roleAllowsPermission(role, resource, action, scopeCtx)
  }

  private async ensureNameUnique(name: string) {
    const trimmed = name.trim()
    const existing = await this.roleRepo.findOne({ where: { name: trimmed } })
    if (existing) {
      throw new BadRequestException('角色名称已存在')
    }
  }

  private validatePermissions(permissions: PermissionEntry[]) {
    for (const entry of permissions) {
      if (!entry.resource || typeof entry.resource !== 'string') {
        throw new BadRequestException('权限资源标识不能为空')
      }
      if (!Array.isArray(entry.actions) || entry.actions.length === 0) {
        throw new BadRequestException(`资源 ${entry.resource} 的操作列表不能为空`)
      }
      if (!entry.scope || !entry.scope.type) {
        throw new BadRequestException(`资源 ${entry.resource} 的权限范围不能为空`)
      }
      const validScopeTypes = ['all', 'project', 'businessLine']
      if (!validScopeTypes.includes(entry.scope.type)) {
        throw new BadRequestException(`资源 ${entry.resource} 的范围类型无效: ${entry.scope.type}`)
      }
    }
  }

  private mapReasonCode(error: unknown) {
    if (error instanceof NotFoundException) return 'ROLE_NOT_FOUND'
    if (error instanceof BadRequestException) return 'VALIDATION_FAILED'
    return 'UNKNOWN_ERROR'
  }

  private async seedDefaults() {
    const n = await this.roleRepo.count()
    if (n > 0) return
    const now = new Date()
    for (const seed of DEFAULT_ROLES) {
      const id = randomUUID()
      await this.roleRepo.save({
        id,
        name: seed.name,
        description: seed.description,
        status: seed.status,
        permissions: seed.permissions,
        createdAt: now,
        updatedAt: now,
      })
    }
  }
}
