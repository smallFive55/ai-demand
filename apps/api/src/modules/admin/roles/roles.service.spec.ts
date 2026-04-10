import { Test, TestingModule } from '@nestjs/testing'
import { AuditService } from '../../../modules/audit/audit.service'
import { IntegrationTestDbModule } from '../../../test/integration-test-db.module'
import { resetTestDatabaseBeforeFile } from '../../../test/integration-test-hooks'
import { RolesService } from './roles.service'

resetTestDatabaseBeforeFile()

describe('RolesService', () => {
  let service: RolesService
  let auditService: AuditService
  let moduleRef: TestingModule

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [IntegrationTestDbModule],
      providers: [RolesService, AuditService],
    }).compile()

    await moduleRef.init()

    service = moduleRef.get<RolesService>(RolesService)
    auditService = moduleRef.get<AuditService>(AuditService)
  })

  afterEach(async () => {
    await moduleRef.close()
  })

  it('seeds default roles on initialization', async () => {
    const roles = await service.list()
    expect(roles).toHaveLength(3)
    const names = roles.map((r) => r.name)
    expect(names).toContain('admin')
    expect(names).toContain('manager')
    expect(names).toContain('viewer')
  })

  it('creates a new role and records audit event', async () => {
    const role = await service.create(
      {
        name: 'auditor',
        description: '审计员',
        permissions: [{ resource: 'admin.account', actions: ['read'], scope: { type: 'all' } }],
      },
      'tester',
      'req-1',
    )

    expect(role).toHaveProperty('id')
    expect(role.name).toBe('auditor')
    expect(role.status).toBe('enabled')
    expect(role.permissions).toHaveLength(1)

    const events = await auditService.list()
    const createEvent = events.find((e) => e.action === 'create' && e.target === role.id)
    expect(createEvent).toBeDefined()
    expect(createEvent!.success).toBe(true)
  })

  it('rejects duplicate role names', async () => {
    await expect(service.create({ name: 'admin' }, 'tester', 'req-dup')).rejects.toThrow(
      '角色名称已存在',
    )
  })

  it('updates a role', async () => {
    const roles = await service.list()
    const viewer = roles.find((r) => r.name === 'viewer')!

    const updated = await service.update(
      viewer.id,
      { description: '更新后的查看者' },
      'tester',
      'req-upd',
    )
    expect(updated.description).toBe('更新后的查看者')
  })

  it('disables a role', async () => {
    const roles = await service.list()
    const viewer = roles.find((r) => r.name === 'viewer')!

    const disabled = await service.disable(viewer.id, 'tester', 'req-dis')
    expect(disabled.status).toBe('disabled')
    expect(await service.exists(viewer.id)).toBe(false)
  })

  it('enables a disabled role', async () => {
    const roles = await service.list()
    const viewer = roles.find((r) => r.name === 'viewer')!

    await service.disable(viewer.id, 'tester', 'req-dis')
    const enabled = await service.enable(viewer.id, 'tester', 'req-en')
    expect(enabled.status).toBe('enabled')
    expect(await service.exists(viewer.id)).toBe(true)
  })

  it('updates permissions matrix', async () => {
    const roles = await service.list()
    const manager = roles.find((r) => r.name === 'manager')!

    const updated = await service.updatePermissions(
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

  it('validates permissions structure on create', async () => {
    await expect(
      service.create(
        {
          name: 'bad-role',
          permissions: [{ resource: '', actions: ['read'], scope: { type: 'all' } }],
        },
        'tester',
        'req-bad',
      ),
    ).rejects.toThrow('权限资源标识不能为空')
  })

  it('validates empty actions list', async () => {
    await expect(
      service.create(
        {
          name: 'bad-role',
          permissions: [{ resource: 'admin.role', actions: [], scope: { type: 'all' } }],
        },
        'tester',
        'req-bad2',
      ),
    ).rejects.toThrow('操作列表不能为空')
  })

  it('validates scope type', async () => {
    await expect(
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
    ).rejects.toThrow('范围类型无效')
  })

  it('checks permission for role (hasPermission)', async () => {
    const roles = await service.list()
    const admin = roles.find((r) => r.name === 'admin')!

    expect(await service.hasPermission(admin.id, 'admin.role', 'read')).toBe(true)
    expect(await service.hasPermission(admin.id, 'admin.role', 'manage')).toBe(true)
    expect(await service.hasPermission(admin.id, 'nonexistent', 'read')).toBe(false)
  })

  it('checks scoped permission', async () => {
    const roles = await service.list()
    const manager = roles.find((r) => r.name === 'manager')!

    await service.updatePermissions(
      manager.id,
      [{ resource: 'admin.account', actions: ['read'], scope: { type: 'project', ids: ['proj-1'] } }],
      'tester',
      'req-scope',
    )

    expect(
      await service.hasPermission(manager.id, 'admin.account', 'read', {
        type: 'project',
        id: 'proj-1',
      }),
    ).toBe(true)
    expect(
      await service.hasPermission(manager.id, 'admin.account', 'read', {
        type: 'project',
        id: 'proj-2',
      }),
    ).toBe(false)
    expect(
      await service.hasPermission(manager.id, 'admin.account', 'read', {
        type: 'businessLine',
        id: 'bl-1',
      }),
    ).toBe(false)
  })

  it('throws when updating non-existent role', async () => {
    await expect(service.update('non-existent-id', { name: 'x' }, 'tester', 'req-404')).rejects.toThrow(
      '角色不存在',
    )
  })

  it('getById returns role or undefined', async () => {
    const roles = await service.list()
    const admin = roles.find((r) => r.name === 'admin')!
    expect(await service.getById(admin.id)).toBeDefined()
    expect(await service.getById('non-existent')).toBeUndefined()
  })

  it('getByName returns role or undefined', async () => {
    expect(await service.getByName('admin')).toBeDefined()
    expect(await service.getByName('nonexistent')).toBeUndefined()
  })

  it('records permission_change audit event on updatePermissions', async () => {
    const roles = await service.list()
    const viewer = roles.find((r) => r.name === 'viewer')!

    await service.updatePermissions(
      viewer.id,
      [{ resource: 'admin.account', actions: ['read', 'create'], scope: { type: 'all' } }],
      'audit-tester',
      'req-audit-perm',
    )

    const events = await auditService.list()
    const permEvent = events.find((e) => e.action === 'permission_change' && e.target === viewer.id)
    expect(permEvent).toBeDefined()
    expect(permEvent!.success).toBe(true)
    expect(permEvent!.actor).toBe('audit-tester')
    expect(permEvent!.requestId).toBe('req-audit-perm')
    expect(Array.isArray(permEvent!.before)).toBe(true)
    expect(Array.isArray(permEvent!.after)).toBe(true)
  })

  it('records failed audit on create error', async () => {
    await expect(service.create({ name: 'admin' }, 'tester', 'req-fail')).rejects.toThrow()

    const failEvents = (await auditService.list()).filter((e) => !e.success)
    expect(failEvents.length).toBeGreaterThan(0)
    expect(failEvents.some((e) => e.reasonCode === 'VALIDATION_FAILED')).toBe(true)
  })

  it('disabled role returns false for hasPermission', async () => {
    const roles = await service.list()
    const viewer = roles.find((r) => r.name === 'viewer')!

    expect(await service.hasPermission(viewer.id, 'admin.account', 'read')).toBe(true)
    await service.disable(viewer.id, 'tester', 'req-dis-check')
    expect(await service.hasPermission(viewer.id, 'admin.account', 'read')).toBe(false)
  })

  it('permission matrix can be read back from storage', async () => {
    const roles = await service.list()
    const manager = roles.find((r) => r.name === 'manager')!

    const newPerms = [
      {
        resource: 'admin.account',
        actions: ['read', 'create', 'update'],
        scope: { type: 'project' as const, ids: ['p1', 'p2'] },
      },
      { resource: 'admin.role', actions: ['read'], scope: { type: 'businessLine' as const, ids: ['bl-1'] } },
    ]
    await service.updatePermissions(manager.id, newPerms, 'tester', 'req-persist')

    const reloadedManager = await service.getByName('manager')
    expect(reloadedManager!.permissions).toHaveLength(2)
    expect(reloadedManager!.permissions[0].scope.ids).toEqual(['p1', 'p2'])
    expect(reloadedManager!.permissions[1].resource).toBe('admin.role')
  })

  it('throws when disabling non-existent role', async () => {
    await expect(service.disable('non-existent', 'tester', 'req-dis-404')).rejects.toThrow('角色不存在')
  })

  it('throws when enabling non-existent role', async () => {
    await expect(service.enable('non-existent', 'tester', 'req-en-404')).rejects.toThrow('角色不存在')
  })
})
