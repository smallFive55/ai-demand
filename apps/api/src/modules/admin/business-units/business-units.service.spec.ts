import { Test, TestingModule } from '@nestjs/testing'
import { AccountsService } from '../accounts/accounts.service'
import { RolesService } from '../roles/roles.service'
import { AuditService } from '../../../modules/audit/audit.service'
import { IntegrationTestDbModule } from '../../../test/integration-test-db.module'
import { BusinessUnitsService } from './business-units.service'

describe('BusinessUnitsService', () => {
  let service: BusinessUnitsService
  let accountsService: AccountsService
  let auditService: AuditService
  let moduleRef: TestingModule

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [IntegrationTestDbModule],
      providers: [BusinessUnitsService, AccountsService, AuditService, RolesService],
    }).compile()

    await moduleRef.init()

    service = moduleRef.get<BusinessUnitsService>(BusinessUnitsService)
    accountsService = moduleRef.get<AccountsService>(AccountsService)
    auditService = moduleRef.get<AuditService>(AuditService)
  })

  afterEach(async () => {
    await moduleRef.close()
  })

  async function seedManager() {
    return accountsService.create(
      { name: '交付经理', email: 'dm@example.com', roleId: 'admin' },
      'seed',
      'seed-req',
    )
  }

  it('creates business unit and records audit', async () => {
    const manager = await seedManager()
    const unit = await service.create(
      {
        name: '核心交易',
        description: '交易域',
        functionList: ['下单', '支付'],
        deliveryManagerId: manager.id,
        admissionCriteria: '需含交易关键词',
        admissionThreshold: 80,
      },
      'tester',
      'req-1',
    )

    expect(unit.id).toBeDefined()
    expect(unit.status).toBe('enabled')
    expect(unit.admissionThreshold).toBe(80)
    expect(
      (await auditService.list()).some((e) => e.action === 'create' && e.target === unit.id && e.success),
    ).toBe(true)
  })

  it('rejects duplicate unit names', async () => {
    const manager = await seedManager()
    await service.create(
      {
        name: '板块A',
        description: '',
        functionList: [],
        deliveryManagerId: manager.id,
        admissionCriteria: '',
      },
      'tester',
      'req-a',
    )
    await expect(
      service.create(
        {
          name: '板块A',
          description: '',
          functionList: [],
          deliveryManagerId: manager.id,
          admissionCriteria: '',
        },
        'tester',
        'req-b',
      ),
    ).rejects.toThrow('板块名称已存在')
  })

  it('rejects missing delivery manager', async () => {
    await expect(
      service.create(
        {
          name: '板块B',
          description: '',
          functionList: [],
          deliveryManagerId: '00000000-0000-0000-0000-000000000000',
          admissionCriteria: '',
        },
        'tester',
        'req-c',
      ),
    ).rejects.toThrow('交付经理账号不存在')
  })

  it('rejects disabled delivery manager', async () => {
    const manager = await seedManager()
    await accountsService.disable(manager.id, 'tester', 'req-dis-acc')
    await expect(
      service.create(
        {
          name: '板块C',
          description: '',
          functionList: [],
          deliveryManagerId: manager.id,
          admissionCriteria: '',
        },
        'tester',
        'req-d',
      ),
    ).rejects.toThrow('交付经理账号已禁用')
  })

  it('updates unit and enforces name uniqueness across others', async () => {
    const manager = await seedManager()
    const u1 = await service.create(
      {
        name: 'U1',
        description: 'd1',
        functionList: [],
        deliveryManagerId: manager.id,
        admissionCriteria: '',
      },
      'tester',
      'r1',
    )
    await service.create(
      {
        name: 'U2',
        description: 'd2',
        functionList: [],
        deliveryManagerId: manager.id,
        admissionCriteria: '',
      },
      'tester',
      'r2',
    )
    await expect(service.update(u1.id, { name: 'U2' }, 'tester', 'r3')).rejects.toThrow('板块名称已存在')
    const updated = await service.update(u1.id, { description: '新描述' }, 'tester', 'r4')
    expect(updated.description).toBe('新描述')
  })

  it('disable and enable toggle status', async () => {
    const manager = await seedManager()
    const unit = await service.create(
      {
        name: 'U3',
        description: '',
        functionList: [],
        deliveryManagerId: manager.id,
        admissionCriteria: '',
      },
      'tester',
      'r5',
    )
    const disabled = await service.disable(unit.id, 'tester', 'r6')
    expect(disabled.status).toBe('disabled')
    const enabled = await service.enable(unit.id, 'tester', 'r7')
    expect(enabled.status).toBe('enabled')
  })

  it('listEnabled filters disabled units', async () => {
    const manager = await seedManager()
    const a = await service.create(
      {
        name: '启用板块',
        description: '',
        functionList: [],
        deliveryManagerId: manager.id,
        admissionCriteria: '',
      },
      'tester',
      'r8',
    )
    await service.create(
      {
        name: '将禁用',
        description: '',
        functionList: [],
        deliveryManagerId: manager.id,
        admissionCriteria: '',
      },
      'tester',
      'r9',
    )
    const list = await service.list()
    const second = list.find((u) => u.name === '将禁用')!
    await service.disable(second.id, 'tester', 'r10')
    const enabled = await service.listEnabled()
    expect(enabled).toHaveLength(1)
    expect(enabled[0].id).toBe(a.id)
  })

  it('rejects non-array functionList on create', async () => {
    const manager = await seedManager()
    await expect(
      service.create(
        {
          name: '坏数据',
          description: '',
          functionList: 'not-array' as unknown as string[],
          deliveryManagerId: manager.id,
          admissionCriteria: '',
        },
        'tester',
        'bad-fl',
      ),
    ).rejects.toThrow('functionList 必须是字符串数组')
  })

  it('rejects functionList with non-string entries on update', async () => {
    const manager = await seedManager()
    const unit = await service.create(
      {
        name: 'U4',
        description: '',
        functionList: ['a'],
        deliveryManagerId: manager.id,
        admissionCriteria: '',
      },
      'tester',
      'r-fl',
    )
    await expect(
      service.update(unit.id, { functionList: ['ok', 1 as unknown as string] }, 'tester', 'r-fl2'),
    ).rejects.toThrow('functionList 只能包含字符串')
  })

  it('enable rejects when delivery manager is disabled', async () => {
    const manager = await seedManager()
    const unit = await service.create(
      {
        name: 'U5',
        description: '',
        functionList: [],
        deliveryManagerId: manager.id,
        admissionCriteria: '',
      },
      'tester',
      'r-en-1',
    )
    await service.disable(unit.id, 'tester', 'r-en-2')
    await accountsService.disable(manager.id, 'tester', 'r-en-3')
    await expect(service.enable(unit.id, 'tester', 'r-en-4')).rejects.toThrow('交付经理账号已禁用')
  })

  it('persists and reloads from database', async () => {
    const manager = await seedManager()
    const created = await service.create(
      {
        name: '持久化',
        description: '',
        functionList: ['a'],
        deliveryManagerId: manager.id,
        admissionCriteria: 'x',
        admissionThreshold: 70,
      },
      'tester',
      'persist-1',
    )

    const reloaded = await service.getById(created.id)
    expect(reloaded?.name).toBe('持久化')
    expect(reloaded?.functionList).toEqual(['a'])
  })
})
