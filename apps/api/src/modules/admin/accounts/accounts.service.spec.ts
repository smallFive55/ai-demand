import { Test, TestingModule } from '@nestjs/testing'
import { AccountsService } from './accounts.service'
import { AuditService } from '../../../modules/audit/audit.service'
import { IntegrationTestDbModule } from '../../../test/integration-test-db.module'
import { RolesService } from '../roles/roles.service'

describe('AccountsService', () => {
  let service: AccountsService
  let auditService: AuditService
  let moduleRef: TestingModule

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [IntegrationTestDbModule],
      providers: [AccountsService, AuditService, RolesService],
    }).compile()

    await moduleRef.init()

    service = moduleRef.get<AccountsService>(AccountsService)
    auditService = moduleRef.get<AuditService>(AuditService)
  })

  afterEach(async () => {
    await moduleRef.close()
  })

  it('creates account and records audit event', async () => {
    const created = await service.create(
      {
        name: 'Alice',
        email: 'alice@example.com',
        roleId: 'admin',
      },
      'tester',
      'req-1',
    )

    expect(created).toHaveProperty('id')
    expect(created).toHaveProperty('status', 'enabled')
    const events = await auditService.list()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      action: 'create',
      requestId: 'req-1',
      success: true,
    })
  })

  it('throws when role does not exist', async () => {
    await expect(
      service.create(
        {
          name: 'Bob',
          email: 'bob@example.com',
          roleId: 'unknown-role',
        },
        'tester',
        'req-2',
      ),
    ).rejects.toThrow('角色不存在')
  })

  it('supports disable lifecycle', async () => {
    const created = await service.create(
      {
        name: 'Cathy',
        email: 'cathy@example.com',
        roleId: 'viewer',
      },
      'tester',
      'req-3',
    )

    const disabled = await service.disable(created.id, 'tester', 'req-4')
    expect(disabled).toHaveProperty('status', 'disabled')
  })

  it('returns partial success in import and logs failed audit', async () => {
    const result = await service.import(
      [
        {
          name: 'David',
          email: 'david@example.com',
          roleId: 'manager',
        },
        {
          name: 'Error',
          email: 'error@example.com',
          roleId: 'missing-role',
        },
      ],
      'tester',
      'req-5',
    )

    expect(result).toMatchObject({
      successCount: 1,
      failureCount: 1,
    })
    expect(result.errors[0]).toMatchObject({
      reasonCode: 'ROLE_NOT_FOUND',
    })
    expect((await auditService.list()).some((event) => !event.success)).toBe(true)
  })

  it('validates roleId against dynamic role data source (not hardcoded)', async () => {
    const rolesService = moduleRef.get<RolesService>(RolesService)
    const custom = await rolesService.create(
      { name: 'custom-role', description: '动态角色' },
      'tester',
      'req-custom',
    )

    const account = await service.create(
      { name: 'Dynamic', email: 'dynamic@test.com', roleId: 'custom-role' },
      'tester',
      'req-dynamic',
    )
    expect(account.roleId).toBe(custom.id)
  })

  it('rejects disabled role in account creation', async () => {
    const rolesService = moduleRef.get<RolesService>(RolesService)
    const viewer = (await rolesService.getByName('viewer'))!
    await rolesService.disable(viewer.id, 'tester', 'req-dis-viewer')

    await expect(
      service.create(
        { name: 'Fail', email: 'fail@test.com', roleId: 'viewer' },
        'tester',
        'req-fail-disabled',
      ),
    ).rejects.toThrow('角色不存在')
  })
})
