import { Test, TestingModule } from '@nestjs/testing'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AuditService } from '../../../modules/audit/audit.service'
import { RolesService } from './roles.service'

describe('RolesService', () => {
  let service: RolesService
  let auditService: AuditService
  let tempDir: string

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'roles-spec-'))
    process.env.ROLES_DATA_FILE = join(tempDir, 'roles.json')
    process.env.AUDIT_DATA_FILE = join(tempDir, 'audit.json')

    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesService, AuditService],
    }).compile()

    service = module.get<RolesService>(RolesService)
    auditService = module.get<AuditService>(AuditService)
  })

  afterEach(() => {
    delete process.env.ROLES_DATA_FILE
    delete process.env.AUDIT_DATA_FILE
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('seeds default roles on initialization', () => {
    const roles = service.list()
    expect(roles).toHaveLength(3)
    const names = roles.map((r) => r.name)
    expect(names).toContain('admin')
    expect(names).toContain('manager')
    expect(names).toContain('viewer')
  })

  it('creates a new role and records audit event', () => {
    const role = service.create(
      {
        name: 'auditor',
        description: '审计员',
        permissions: [
          { resource: 'admin.account', actions: ['read'], scope: { type: 'all' } },
        ],
      },
      'tester',
      'req-1',
    )

    expect(role).toHaveProperty('id')
    expect(role.name).toBe('auditor')
    expect(role.status).toBe('enabled')
    expect(role.permissions).toHaveLength(1)

    const events = auditService.list()
    const createEvent = events.find(
      (e) => e.action === 'create' && e.target === role.id,
    )
    expect(createEvent).toBeDefined()
    expect(createEvent!.success).toBe(true)
  })

  it('rejects duplicate role names', () => {
    expect(() =>
      service.create({ name: 'admin' }, 'tester', 'req-dup'),
    ).toThrow('角色名称已存在')
  })

  it('updates a role', () => {
    const roles = service.list()
    const viewer = roles.find((r) => r.name === 'viewer')!

    const updated = service.update(
      viewer.id,
      { description: '更新后的查看者' },
      'tester',
      'req-upd',
    )
    expect(updated.description).toBe('更新后的查看者')
  })

  it('disables a role', () => {
    const roles = service.list()
    const viewer = roles.find((r) => r.name === 'viewer')!

    const disabled = service.disable(viewer.id, 'tester', 'req-dis')
    expect(disabled.status).toBe('disabled')
    expect(service.exists(viewer.id)).toBe(false)
  })

  it('enables a disabled role', () => {
    const roles = service.list()
    const viewer = roles.find((r) => r.name === 'viewer')!

    service.disable(viewer.id, 'tester', 'req-dis')
    const enabled = service.enable(viewer.id, 'tester', 'req-en')
    expect(enabled.status).toBe('enabled')
    expect(service.exists(viewer.id)).toBe(true)
  })

  it('updates permissions matrix', () => {
    const roles = service.list()
    const manager = roles.find((r) => r.name === 'manager')!

    const updated = service.updatePermissions(
      manager.id,
      [
        { resource: 'admin.account', actions: ['read', 'create'], scope: { type: 'all' } },
        { resource: 'admin.role', actions: ['read'], scope: { type: 'project', ids: ['proj-1'] } },
      ],
      'tester',
      'req-perm',
    )

    expect(updated.permissions).toHaveLength(2)
    expect(updated.permissions[1].scope.type).toBe('project')
  })

  it('validates permissions structure on create', () => {
    expect(() =>
      service.create(
        {
          name: 'bad-role',
          permissions: [
            { resource: '', actions: ['read'], scope: { type: 'all' } },
          ],
        },
        'tester',
        'req-bad',
      ),
    ).toThrow('权限资源标识不能为空')
  })

  it('validates empty actions list', () => {
    expect(() =>
      service.create(
        {
          name: 'bad-role',
          permissions: [
            { resource: 'admin.role', actions: [], scope: { type: 'all' } },
          ],
        },
        'tester',
        'req-bad2',
      ),
    ).toThrow('操作列表不能为空')
  })

  it('validates scope type', () => {
    expect(() =>
      service.create(
        {
          name: 'bad-role',
          permissions: [
            { resource: 'admin.role', actions: ['read'], scope: { type: 'invalid' as never } },
          ],
        },
        'tester',
        'req-bad3',
      ),
    ).toThrow('范围类型无效')
  })

  it('checks permission for role (hasPermission)', () => {
    const roles = service.list()
    const admin = roles.find((r) => r.name === 'admin')!

    expect(service.hasPermission(admin.id, 'admin.role', 'read')).toBe(true)
    expect(service.hasPermission(admin.id, 'admin.role', 'manage')).toBe(true)
    expect(service.hasPermission(admin.id, 'nonexistent', 'read')).toBe(false)
  })

  it('checks scoped permission', () => {
    const roles = service.list()
    const manager = roles.find((r) => r.name === 'manager')!

    service.updatePermissions(
      manager.id,
      [
        { resource: 'admin.account', actions: ['read'], scope: { type: 'project', ids: ['proj-1'] } },
      ],
      'tester',
      'req-scope',
    )

    expect(
      service.hasPermission(manager.id, 'admin.account', 'read', { type: 'project', id: 'proj-1' }),
    ).toBe(true)
    expect(
      service.hasPermission(manager.id, 'admin.account', 'read', { type: 'project', id: 'proj-2' }),
    ).toBe(false)
    expect(
      service.hasPermission(manager.id, 'admin.account', 'read', { type: 'businessLine', id: 'bl-1' }),
    ).toBe(false)
  })

  it('throws when updating non-existent role', () => {
    expect(() =>
      service.update('non-existent-id', { name: 'x' }, 'tester', 'req-404'),
    ).toThrow('角色不存在')
  })

  it('getById returns role or undefined', () => {
    const roles = service.list()
    const admin = roles.find((r) => r.name === 'admin')!
    expect(service.getById(admin.id)).toBeDefined()
    expect(service.getById('non-existent')).toBeUndefined()
  })

  it('getByName returns role or undefined', () => {
    expect(service.getByName('admin')).toBeDefined()
    expect(service.getByName('nonexistent')).toBeUndefined()
  })

  it('records permission_change audit event on updatePermissions', () => {
    const roles = service.list()
    const viewer = roles.find((r) => r.name === 'viewer')!

    service.updatePermissions(
      viewer.id,
      [{ resource: 'admin.account', actions: ['read', 'create'], scope: { type: 'all' } }],
      'audit-tester',
      'req-audit-perm',
    )

    const events = auditService.list()
    const permEvent = events.find(
      (e) => e.action === 'permission_change' && e.target === viewer.id,
    )
    expect(permEvent).toBeDefined()
    expect(permEvent!.success).toBe(true)
    expect(permEvent!.actor).toBe('audit-tester')
    expect(permEvent!.requestId).toBe('req-audit-perm')
    expect(Array.isArray(permEvent!.before)).toBe(true)
    expect(Array.isArray(permEvent!.after)).toBe(true)
  })

  it('records failed audit on create error', () => {
    expect(() =>
      service.create({ name: 'admin' }, 'tester', 'req-fail'),
    ).toThrow()

    const failEvents = auditService.list().filter((e) => !e.success)
    expect(failEvents.length).toBeGreaterThan(0)
    expect(failEvents.some((e) => e.reasonCode === 'VALIDATION_FAILED')).toBe(true)
  })

  it('disabled role returns false for hasPermission', () => {
    const roles = service.list()
    const viewer = roles.find((r) => r.name === 'viewer')!

    expect(service.hasPermission(viewer.id, 'admin.account', 'read')).toBe(true)
    service.disable(viewer.id, 'tester', 'req-dis-check')
    expect(service.hasPermission(viewer.id, 'admin.account', 'read')).toBe(false)
  })

  it('permission matrix persists and reloads correctly', async () => {
    const roles = service.list()
    const manager = roles.find((r) => r.name === 'manager')!

    const newPerms = [
      { resource: 'admin.account', actions: ['read', 'create', 'update'], scope: { type: 'project' as const, ids: ['p1', 'p2'] } },
      { resource: 'admin.role', actions: ['read'], scope: { type: 'businessLine' as const, ids: ['bl-1'] } },
    ]
    service.updatePermissions(manager.id, newPerms, 'tester', 'req-persist')

    const module2: TestingModule = await Test.createTestingModule({
      providers: [RolesService, AuditService],
    }).compile()
    const reloaded = module2.get<RolesService>(RolesService)

    const reloadedManager = reloaded.getByName('manager')!
    expect(reloadedManager.permissions).toHaveLength(2)
    expect(reloadedManager.permissions[0].scope.ids).toEqual(['p1', 'p2'])
    expect(reloadedManager.permissions[1].resource).toBe('admin.role')
  })

  it('throws when disabling non-existent role', () => {
    expect(() =>
      service.disable('non-existent', 'tester', 'req-dis-404'),
    ).toThrow('角色不存在')
  })

  it('throws when enabling non-existent role', () => {
    expect(() =>
      service.enable('non-existent', 'tester', 'req-en-404'),
    ).toThrow('角色不存在')
  })
})
