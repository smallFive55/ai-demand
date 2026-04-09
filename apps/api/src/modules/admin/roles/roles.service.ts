import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
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
    ],
  },
  {
    name: 'manager',
    description: '业务经理，拥有业务数据读写权限',
    status: 'enabled',
    permissions: [
      { resource: 'admin.account', actions: ['read'], scope: { type: 'all' } },
    ],
  },
  {
    name: 'viewer',
    description: '只读查看者，仅拥有查看权限',
    status: 'enabled',
    permissions: [
      { resource: 'admin.account', actions: ['read'], scope: { type: 'all' } },
    ],
  },
]

@Injectable()
export class RolesService {
  private readonly roles = new Map<string, Role>()
  private readonly dataFile = resolve(
    process.cwd(),
    process.env.ROLES_DATA_FILE ?? '.runtime-data/roles.json',
  )

  constructor(private readonly auditService: AuditService) {
    this.loadFromDisk()
    this.seedDefaults()
  }

  list() {
    return Array.from(this.roles.values()).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    )
  }

  getById(id: string): Role | undefined {
    return this.roles.get(id)
  }

  getByName(name: string): Role | undefined {
    return Array.from(this.roles.values()).find((r) => r.name === name)
  }

  exists(id: string): boolean {
    const role = this.roles.get(id)
    return !!role && role.status === 'enabled'
  }

  create(input: CreateRoleInput, actor: string, requestId: string): Role {
    try {
      this.ensureNameUnique(input.name)
      if (input.permissions) {
        this.validatePermissions(input.permissions)
      }

      const now = new Date().toISOString()
      const role: Role = {
        id: randomUUID(),
        name: input.name.trim(),
        description: (input.description ?? '').trim(),
        status: 'enabled',
        permissions: input.permissions ?? [],
        createdAt: now,
        updatedAt: now,
      }

      this.roles.set(role.id, role)
      this.persist()
      this.auditService.record({
        action: 'create',
        actor,
        target: role.id,
        requestId,
        occurredAt: now,
        before: null,
        after: role,
        success: true,
      })
      return role
    } catch (error) {
      this.auditService.record({
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

  update(id: string, input: UpdateRoleInput, actor: string, requestId: string): Role {
    try {
      const current = this.roles.get(id)
      if (!current) {
        throw new NotFoundException('角色不存在')
      }
      if (input.name && input.name !== current.name) {
        this.ensureNameUnique(input.name)
      }
      if (input.permissions) {
        this.validatePermissions(input.permissions)
      }

      const before = { ...current, permissions: [...current.permissions] }
      const now = new Date().toISOString()
      const next: Role = {
        ...current,
        name: input.name?.trim() ?? current.name,
        description: input.description?.trim() ?? current.description,
        permissions: input.permissions ?? current.permissions,
        updatedAt: now,
      }

      this.roles.set(id, next)
      this.persist()
      this.auditService.record({
        action: 'update',
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

  disable(id: string, actor: string, requestId: string): Role {
    try {
      const current = this.roles.get(id)
      if (!current) {
        throw new NotFoundException('角色不存在')
      }

      const before = { ...current }
      const now = new Date().toISOString()
      const next: Role = {
        ...current,
        status: 'disabled',
        updatedAt: now,
      }

      this.roles.set(id, next)
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

  enable(id: string, actor: string, requestId: string): Role {
    try {
      const current = this.roles.get(id)
      if (!current) {
        throw new NotFoundException('角色不存在')
      }

      const before = { ...current }
      const now = new Date().toISOString()
      const next: Role = {
        ...current,
        status: 'enabled',
        updatedAt: now,
      }

      this.roles.set(id, next)
      this.persist()
      this.auditService.record({
        action: 'enable',
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

  updatePermissions(
    id: string,
    permissions: PermissionEntry[],
    actor: string,
    requestId: string,
  ): Role {
    try {
      const current = this.roles.get(id)
      if (!current) {
        throw new NotFoundException('角色不存在')
      }
      this.validatePermissions(permissions)

      const before = { ...current, permissions: [...current.permissions] }
      const now = new Date().toISOString()
      const next: Role = {
        ...current,
        permissions,
        updatedAt: now,
      }

      this.roles.set(id, next)
      this.persist()
      this.auditService.record({
        action: 'permission_change',
        actor,
        target: id,
        requestId,
        occurredAt: now,
        before: before.permissions,
        after: next.permissions,
        success: true,
      })
      return next
    } catch (error) {
      this.auditService.record({
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

  hasPermission(roleId: string, resource: string, action: string, scopeCtx?: { type: string; id: string }): boolean {
    const role = this.roles.get(roleId)
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

  private ensureNameUnique(name: string) {
    const trimmed = name.trim()
    const duplicate = Array.from(this.roles.values()).some(
      (role) => role.name === trimmed,
    )
    if (duplicate) {
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

  private seedDefaults() {
    if (this.roles.size > 0) return
    const now = new Date().toISOString()
    for (const seed of DEFAULT_ROLES) {
      const role: Role = {
        ...seed,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      }
      this.roles.set(role.id, role)
    }
    this.persist()
  }

  private loadFromDisk() {
    if (!existsSync(this.dataFile)) return
    const raw = readFileSync(this.dataFile, 'utf8')
    if (!raw.trim()) return
    const parsed = JSON.parse(raw) as Role[]
    parsed.forEach((role) => this.roles.set(role.id, role))
  }

  private persist() {
    mkdirSync(dirname(this.dataFile), { recursive: true })
    writeFileSync(
      this.dataFile,
      JSON.stringify(Array.from(this.roles.values()), null, 2),
      'utf8',
    )
  }
}
