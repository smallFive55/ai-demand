import { Test, TestingModule } from '@nestjs/testing'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AccountsService } from './accounts.service'
import { AuditService } from '../../../modules/audit/audit.service'
import { RolesService } from '../roles/roles.service'

describe('AccountsService', () => {
  let service: AccountsService
  let auditService: AuditService
  let module: TestingModule
  let tempDir: string

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'accounts-spec-'))
    process.env.ACCOUNTS_DATA_FILE = join(tempDir, 'accounts.json')
    process.env.AUDIT_DATA_FILE = join(tempDir, 'audit.json')
    process.env.ROLES_DATA_FILE = join(tempDir, 'roles.json')

    module = await Test.createTestingModule({
      providers: [AccountsService, AuditService, RolesService],
    }).compile()

    service = module.get<AccountsService>(AccountsService)
    auditService = module.get<AuditService>(AuditService)
  })

  afterEach(() => {
    delete process.env.ACCOUNTS_DATA_FILE
    delete process.env.AUDIT_DATA_FILE
    delete process.env.ROLES_DATA_FILE
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('creates account and records audit event', () => {
    const created = service.create(
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
    expect(auditService.list()).toHaveLength(1)
    expect(auditService.list()[0]).toMatchObject({
      action: 'create',
      requestId: 'req-1',
      success: true,
    })
  })

  it('throws when role does not exist', () => {
    expect(() =>
      service.create(
        {
          name: 'Bob',
          email: 'bob@example.com',
          roleId: 'unknown-role',
        },
        'tester',
        'req-2',
      ),
    ).toThrow('角色不存在')
  })

  it('supports disable lifecycle', () => {
    const created = service.create(
      {
        name: 'Cathy',
        email: 'cathy@example.com',
        roleId: 'viewer',
      },
      'tester',
      'req-3',
    )

    const disabled = service.disable(created.id, 'tester', 'req-4')
    expect(disabled).toHaveProperty('status', 'disabled')
  })

  it('returns partial success in import and logs failed audit', () => {
    const result = service.import(
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
    expect(auditService.list().some((event) => !event.success)).toBe(true)
  })

  it('validates roleId against dynamic role data source (not hardcoded)', () => {
    const rolesService = module.get<RolesService>(RolesService)
    rolesService.create(
      { name: 'custom-role', description: '动态角色' },
      'tester',
      'req-custom',
    )

    const account = service.create(
      { name: 'Dynamic', email: 'dynamic@test.com', roleId: 'custom-role' },
      'tester',
      'req-dynamic',
    )
    expect(account.roleId).toBe('custom-role')
  })

  it('rejects disabled role in account creation', () => {
    const rolesService = module.get<RolesService>(RolesService)
    const viewer = rolesService.getByName('viewer')!
    rolesService.disable(viewer.id, 'tester', 'req-dis-viewer')

    expect(() =>
      service.create(
        { name: 'Fail', email: 'fail@test.com', roleId: 'viewer' },
        'tester',
        'req-fail-disabled',
      ),
    ).toThrow('角色不存在')
  })
})
