import {
  BadRequestException,
  ForbiddenException,
  GatewayTimeoutException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { RequirementFieldSnapshotEntity } from '../../database/entities/requirement-field-snapshot.entity'
import { RequirementMessageEntity } from '../../database/entities/requirement-message.entity'
import { RequirementEntity } from '../../database/entities/requirement.entity'
import { BusinessUnitsService } from '../admin/business-units/business-units.service'
import { AuditService } from '../audit/audit.service'
import { NotificationsService } from '../notifications/notifications.service'
import { LLM_CHAT } from './llm/llm-chat.port'
import { RequirementsService } from './requirements.service'

function reqEntity(over: Partial<RequirementEntity> = {}): RequirementEntity {
  return {
    id: 'rid',
    title: '新需求草稿',
    status: 'collecting',
    submitterId: 'biz-b',
    businessUnitId: null,
    projectIds: [],
    admissionScore: null,
    admissionRationale: null,
    deliveryManagerId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }
}

describe('RequirementsService', () => {
  let service: RequirementsService
  let moduleRef: TestingModule

  const mockReqRepo = {
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  }
  const mockMsgRepo = {
    save: jest.fn(),
    find: jest.fn(),
  }
  const mockSnapRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  }
  const mockAudit = {
    record: jest.fn().mockResolvedValue(undefined),
  }
  const mockLlm = {
    complete: jest.fn(),
    scoreIntake: jest.fn(),
  }
  const mockBu = {
    listEnabled: jest.fn().mockResolvedValue([]),
  }
  const mockNotifications = {
    notifyRequirementAbandoned: jest.fn().mockResolvedValue({
      success: true,
      attempts: 1,
      fallbackTriggered: false,
    }),
    // Story 2.4：接待成功通知 mock（默认成功）
    notifyRequirementReceived: jest.fn().mockResolvedValue({
      success: true,
      attempts: 1,
      fallbackTriggered: false,
    }),
    track: jest.fn(<T,>(p: Promise<T>): Promise<T> => p),
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    const qb: {
      select: jest.Mock
      where: jest.Mock
      getRawOne: jest.Mock
    } = {
      select: jest.fn(),
      where: jest.fn(),
      getRawOne: jest.fn().mockResolvedValue({ maxv: null }),
    }
    qb.select.mockReturnValue(qb)
    qb.where.mockReturnValue(qb)
    mockSnapRepo.createQueryBuilder.mockReturnValue(qb)

    moduleRef = await Test.createTestingModule({
      providers: [
        RequirementsService,
        { provide: getRepositoryToken(RequirementEntity), useValue: mockReqRepo },
        { provide: getRepositoryToken(RequirementMessageEntity), useValue: mockMsgRepo },
        { provide: getRepositoryToken(RequirementFieldSnapshotEntity), useValue: mockSnapRepo },
        { provide: AuditService, useValue: mockAudit },
        { provide: BusinessUnitsService, useValue: mockBu },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: LLM_CHAT, useValue: mockLlm },
      ],
    }).compile()

    service = moduleRef.get(RequirementsService)
  })

  afterEach(async () => {
    await moduleRef.close()
  })

  it('rejects create for non-business role', async () => {
    await expect(service.create({ id: 'a1', role: 'admin' }, 'req-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('creates requirement and seeds greeting message', async () => {
    const actor = { id: 'biz-a', role: 'business' as const }
    let savedId = ''

    mockReqRepo.save.mockImplementation(async (row: RequirementEntity) => {
      savedId = row.id
      return row
    })
    mockMsgRepo.save.mockImplementation(async (m: RequirementMessageEntity) => ({
      ...m,
      id: 'msg-greet',
      createdAt: m.createdAt,
    }))
    mockReqRepo.findOne.mockImplementation(async () =>
      reqEntity({
        id: savedId,
        submitterId: actor.id,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    )
    mockSnapRepo.findOne.mockResolvedValue(null)

    const row = await service.create(actor, 'req-2')
    expect(row.id).toBe(savedId)
    expect(row.submitterId).toBe(actor.id)
    expect(mockReqRepo.save).toHaveBeenCalled()
    expect(mockMsgRepo.save).toHaveBeenCalled()
  })

  it('persists user message and snapshot when LLM succeeds', async () => {
    const actor = { id: 'biz-b', role: 'business' as const }
    const reqId = '22222222-2222-2222-2222-222222222222'

    mockReqRepo.findOne.mockResolvedValue(reqEntity({ id: reqId, submitterId: actor.id }))
    mockMsgRepo.save.mockImplementation(async (m: RequirementMessageEntity) => ({
      ...m,
      id: `msg-${m.role}-${Math.random()}`,
      createdAt: m.createdAt,
    }))
    mockMsgRepo.find.mockResolvedValue([
      {
        id: '1',
        requirementId: reqId,
        role: 'ai',
        content: 'hi',
        createdAt: new Date(),
      },
      {
        id: '2',
        requirementId: reqId,
        role: 'user',
        content: '我们需要一个报表',
        createdAt: new Date(),
      },
    ])
    mockLlm.complete.mockResolvedValue({
      assistantText: 'AI 已回复',
      collectedFieldsPatch: { goalBackground: '整合目标' },
    })
    mockSnapRepo.findOne.mockResolvedValue(null)
    mockReqRepo.update.mockResolvedValue({ affected: 1 })

    const out = await service.appendMessage(reqId, '我们需要一个报表', actor, 'r2')
    expect(out.userMessage.content).toBe('我们需要一个报表')
    expect(out.aiMessage.role).toBe('ai')
    expect(out.collectedFields.goalBackground).toBe('整合目标')
    expect(mockSnapRepo.save).toHaveBeenCalled()
  })

  it('rejects append when requirement is already received', async () => {
    const actor = { id: 'biz-b', role: 'business' as const }
    const reqId = '55555555-5555-5555-5555-555555555555'

    mockReqRepo.findOne.mockResolvedValue(
      reqEntity({ id: reqId, submitterId: actor.id, status: 'received' }),
    )

    await expect(
      service.appendMessage(reqId, 'hello', actor, 'r2'),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('maps LLM AbortError to GatewayTimeoutException', async () => {
    const actor = { id: 'biz-d', role: 'business' as const }
    const reqId = '44444444-4444-4444-4444-444444444444'

    mockReqRepo.findOne.mockResolvedValue(reqEntity({ id: reqId, submitterId: actor.id }))
    mockMsgRepo.save.mockImplementation(async (m: RequirementMessageEntity) => ({
      ...m,
      id: `msg-${m.role}`,
      createdAt: m.createdAt,
    }))
    mockMsgRepo.find.mockResolvedValue([
      { id: '1', requirementId: reqId, role: 'user', content: 'ping', createdAt: new Date() },
    ])
    const abortErr = new Error('Aborted')
    abortErr.name = 'AbortError'
    mockLlm.complete.mockRejectedValue(abortErr)

    await expect(service.appendMessage(reqId, 'ping', actor, 'r2')).rejects.toBeInstanceOf(
      GatewayTimeoutException,
    )
    expect(mockMsgRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'user', content: 'ping' }),
    )
  })

  it('keeps user message when LLM fails', async () => {
    const actor = { id: 'biz-c', role: 'business' as const }
    const reqId = '33333333-3333-3333-3333-333333333333'

    mockReqRepo.findOne.mockResolvedValue(reqEntity({ id: reqId, submitterId: actor.id }))
    mockMsgRepo.save.mockImplementation(async (m: RequirementMessageEntity) => ({
      ...m,
      id: `msg-${m.role}`,
      createdAt: m.createdAt,
    }))
    mockMsgRepo.find.mockResolvedValue([
      { id: '1', requirementId: reqId, role: 'user', content: '超时测试', createdAt: new Date() },
    ])
    mockLlm.complete.mockRejectedValue(new Error('LLM down'))

    await expect(service.appendMessage(reqId, '超时测试', actor, 'r2')).rejects.toThrow()
    expect(mockMsgRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'user', content: '超时测试' }),
    )
  })

  it('denies read for another business user', async () => {
    mockReqRepo.findOne.mockResolvedValue(reqEntity({ submitterId: 'owner' }))
    await expect(
      service.getById('rid', { id: 'other', role: 'business' }, 'r'),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('allows read for admin role (traceability)', async () => {
    mockReqRepo.findOne.mockResolvedValue(reqEntity({ submitterId: 'owner' }))
    mockSnapRepo.findOne.mockResolvedValue(null)
    const row = await service.getById('rid', { id: 'adm', role: 'admin' }, 'r')
    expect(row.id).toBe('rid')
    expect(row.submitterId).toBe('owner')
  })

  it('allows read for delivery_manager role (traceability)', async () => {
    mockReqRepo.findOne.mockResolvedValue(reqEntity({ id: 'rid2', submitterId: 'owner' }))
    mockSnapRepo.findOne.mockResolvedValue(null)
    const row = await service.getById('rid2', { id: 'dm1', role: 'delivery_manager' }, 'r')
    expect(row.id).toBe('rid2')
  })

  it('denies read for unknown role', async () => {
    mockReqRepo.findOne.mockResolvedValue(reqEntity({ submitterId: 'owner' }))
    await expect(
      service.getById('rid', { id: 'x', role: 'unknown_role' }, 'r'),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('transitions to received when intake score meets threshold', async () => {
    const actor = { id: 'biz-e', role: 'business' as const }
    const reqId = '66666666-6666-6666-6666-666666666666'
    const buId = 'bu-1'

    mockReqRepo.findOne.mockResolvedValue(reqEntity({ id: reqId, submitterId: actor.id }))
    mockMsgRepo.save.mockImplementation(async (m: RequirementMessageEntity) => ({
      ...m,
      id: `msg-${m.role}`,
      createdAt: m.createdAt,
    }))
    mockMsgRepo.find.mockResolvedValue([
      { id: '1', requirementId: reqId, role: 'user', content: '完整描述', createdAt: new Date() },
    ])
    mockLlm.complete.mockResolvedValue({
      assistantText: '好的',
      collectedFieldsPatch: {
        goalBackground: 'a',
        coreScope: 'b',
        successCriteria: 'c',
      },
      intakeSuggestion: {
        suggestedBusinessUnitId: buId,
        projectIds: ['p1'],
        admissionScore: 90,
        admissionRationale: '匹配',
      },
    })
    mockSnapRepo.findOne.mockResolvedValue(null)
    mockReqRepo.update.mockResolvedValue({ affected: 1 })
    mockBu.listEnabled.mockResolvedValue([
      {
        id: buId,
        name: '测试板块',
        description: '',
        functionList: [],
        deliveryManagerId: 'dm-x',
        admissionCriteria: '标准',
        admissionThreshold: 80,
        status: 'enabled',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])

    await service.appendMessage(reqId, '完整描述', actor, 'r2')

    // Story 2.4：applyCollectingToReceived 现在走条件 UPDATE (`WHERE status='collecting'`)。
    expect(mockReqRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: reqId, status: 'collecting' }),
      expect.objectContaining({ status: 'received', deliveryManagerId: 'dm-x' }),
    )
  })

  const sampleEnabledBu = (id: string, threshold = 80) => ({
    id,
    name: '测试板块',
    description: '',
    functionList: [] as string[],
    deliveryManagerId: 'dm-x',
    admissionCriteria: '标准',
    admissionThreshold: threshold,
    status: 'enabled' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  const completeSnapshot = (requirementId: string) => ({
    id: 'snap-1',
    requirementId,
    version: 1,
    collectedFields: {
      goalBackground: 'a',
      coreScope: 'b',
      successCriteria: 'c',
    },
  })

  describe('listEnabledBusinessUnitsForIntake', () => {
    it('rejects disallowed roles', async () => {
      await expect(
        service.listEnabledBusinessUnitsForIntake(
          { id: 'u1', role: 'unknown_role' },
          'r1',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException)
      expect(mockBu.listEnabled).not.toHaveBeenCalled()
    })

    it('returns enabled summaries for business actor', async () => {
      mockBu.listEnabled.mockResolvedValue([sampleEnabledBu('bu-1')])
      const out = await service.listEnabledBusinessUnitsForIntake(
        { id: 'biz', role: 'business' },
        'r1',
      )
      expect(out).toEqual([
        {
          id: 'bu-1',
          name: '测试板块',
          description: '',
          functionList: [],
        },
      ])
    })

    it('allows admin to list enabled summaries for intake', async () => {
      mockBu.listEnabled.mockResolvedValue([sampleEnabledBu('bu-1')])
      const out = await service.listEnabledBusinessUnitsForIntake(
        { id: 'adm', role: 'admin' },
        'r1',
      )
      expect(out).toHaveLength(1)
    })
  })

  describe('patchIntake', () => {
    const actor = { id: 'biz-b', role: 'business' as const }
    const reqId = '77777777-7777-7777-7777-777777777777'
    const buId = 'bu-patch'

    it('rejects non-business actor', async () => {
      await expect(
        service.patchIntake(reqId, buId, { id: 'adm', role: 'admin' }, 'r'),
      ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('rejects empty businessUnitId', async () => {
      await expect(service.patchIntake(reqId, '  ', actor, 'r')).rejects.toBeInstanceOf(
        BadRequestException,
      )
    })

    it('throws NotFoundException when requirement missing', async () => {
      mockReqRepo.findOne.mockResolvedValue(null)
      await expect(service.patchIntake(reqId, buId, actor, 'r')).rejects.toBeInstanceOf(
        NotFoundException,
      )
    })

    it('rejects when submitter is not owner', async () => {
      mockReqRepo.findOne.mockResolvedValue(reqEntity({ id: reqId, submitterId: 'other' }))
      await expect(service.patchIntake(reqId, buId, actor, 'r')).rejects.toBeInstanceOf(
        ForbiddenException,
      )
    })

    it('rejects when status is not collecting', async () => {
      mockReqRepo.findOne.mockResolvedValue(
        reqEntity({ id: reqId, submitterId: actor.id, status: 'received' }),
      )
      await expect(service.patchIntake(reqId, buId, actor, 'r')).rejects.toBeInstanceOf(
        BadRequestException,
      )
    })

    it('rejects invalid or disabled business unit id', async () => {
      mockReqRepo.findOne.mockResolvedValue(reqEntity({ id: reqId, submitterId: actor.id }))
      mockBu.listEnabled.mockResolvedValue([sampleEnabledBu('other-id')])
      await expect(service.patchIntake(reqId, buId, actor, 'r')).rejects.toBeInstanceOf(
        BadRequestException,
      )
    })

    it('rejects when core fields not yet complete in snapshot', async () => {
      mockReqRepo.findOne.mockResolvedValue(reqEntity({ id: reqId, submitterId: actor.id }))
      mockBu.listEnabled.mockResolvedValue([sampleEnabledBu(buId)])
      mockSnapRepo.findOne.mockResolvedValue({
        ...completeSnapshot(reqId),
        collectedFields: { goalBackground: 'a', coreScope: 'b' },
      })
      await expect(service.patchIntake(reqId, buId, actor, 'r')).rejects.toBeInstanceOf(
        BadRequestException,
      )
    })

    it('maps scoreIntake failure to ServiceUnavailableException', async () => {
      mockReqRepo.findOne.mockResolvedValue(reqEntity({ id: reqId, submitterId: actor.id }))
      mockBu.listEnabled.mockResolvedValue([sampleEnabledBu(buId)])
      mockSnapRepo.findOne.mockResolvedValue(completeSnapshot(reqId))
      mockLlm.scoreIntake.mockRejectedValue(new Error('LLM unavailable'))
      await expect(service.patchIntake(reqId, buId, actor, 'r')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      )
    })

    it('persists score and stays collecting when below threshold', async () => {
      let findCount = 0
      mockReqRepo.findOne.mockImplementation(async () => {
        findCount++
        if (findCount === 1) {
          return reqEntity({ id: reqId, submitterId: actor.id, status: 'collecting' })
        }
        return reqEntity({
          id: reqId,
          submitterId: actor.id,
          status: 'collecting',
          businessUnitId: buId,
          admissionScore: 40,
          admissionRationale: '低',
          projectIds: [],
        })
      })
      mockBu.listEnabled.mockResolvedValue([sampleEnabledBu(buId, 80)])
      mockSnapRepo.findOne.mockResolvedValue(completeSnapshot(reqId))
      mockLlm.scoreIntake.mockResolvedValue({ score: 40, rationale: '低' })
      mockReqRepo.update.mockResolvedValue({ affected: 1 })

      const out = await service.patchIntake(reqId, buId, actor, 'r2')

      expect(out.status).toBe('collecting')
      expect(out.admissionAssessment.admissionScore).toBe(40)
      expect(mockReqRepo.update).toHaveBeenCalledWith(
        reqId,
        expect.objectContaining({
          businessUnitId: buId,
          admissionScore: 40,
        }),
      )
      expect(mockReqRepo.update).not.toHaveBeenCalledWith(
        reqId,
        expect.objectContaining({ status: 'received' }),
      )
    })

    it('transitions to received when manual patch score meets threshold', async () => {
      let findCount = 0
      mockReqRepo.findOne.mockImplementation(async () => {
        findCount++
        if (findCount === 1) {
          return reqEntity({ id: reqId, submitterId: actor.id, status: 'collecting' })
        }
        return reqEntity({
          id: reqId,
          submitterId: actor.id,
          status: 'received',
          businessUnitId: buId,
          admissionScore: 90,
          admissionRationale: '通过',
          projectIds: [],
          deliveryManagerId: 'dm-x',
        })
      })
      mockBu.listEnabled.mockResolvedValue([sampleEnabledBu(buId, 70)])
      mockSnapRepo.findOne.mockResolvedValue(completeSnapshot(reqId))
      mockLlm.scoreIntake.mockResolvedValue({ score: 90, rationale: '通过' })
      mockReqRepo.update.mockResolvedValue({ affected: 1 })

      const out = await service.patchIntake(reqId, buId, actor, 'r3')

      expect(out.status).toBe('received')
      // Story 2.4：applyCollectingToReceived 现在走条件 UPDATE (`WHERE status='collecting'`)。
      expect(mockReqRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: reqId, status: 'collecting' }),
        expect.objectContaining({ status: 'received', deliveryManagerId: 'dm-x' }),
      )
    })
  })

  describe('abandonRequirement (Story 2.3)', () => {
    const reqId = 'abandon-req-1'
    const actor = { id: 'biz-b', role: 'business' as const }
    const reqId2 = 'abandon-req-2'

    /** 刷新 microtask 队列，便于观察 fire-and-forget 的副作用（通知调度） */
    const flushMicrotasks = async () => {
      await new Promise<void>((resolve) => setImmediate(resolve))
    }

    it('allows submitter to abandon a collecting requirement and records audit', async () => {
      mockReqRepo.findOne.mockResolvedValueOnce(
        reqEntity({ id: reqId, submitterId: actor.id, status: 'collecting', title: '活动自动化' }),
      )
      mockReqRepo.update.mockResolvedValue({ affected: 1 })
      mockReqRepo.findOne.mockResolvedValueOnce(
        reqEntity({ id: reqId, submitterId: actor.id, status: 'abandoned' }),
      )

      const result = await service.abandonRequirement(reqId, actor, 'req-123', '业务方主动关闭')
      await flushMicrotasks()

      expect(result.status).toBe('abandoned')
      // M5：条件 UPDATE（criteria 含 status=collecting）
      expect(mockReqRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: reqId, status: 'collecting' }),
        expect.objectContaining({ status: 'abandoned' }),
      )
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'requirement_status_change',
          actor: actor.id,
          target: reqId,
          after: expect.objectContaining({ status: 'abandoned', reason: '业务方主动关闭' }),
        }),
      )
      expect(mockNotifications.notifyRequirementAbandoned).toHaveBeenCalledWith(
        expect.objectContaining({
          requirementId: reqId,
          requirementTitle: '活动自动化',
          reason: '业务方主动关闭',
          recipientId: actor.id,
          actor: actor.id,
          requestId: 'req-123',
        }),
      )
    })

    it('does not break main flow when notification orchestrator unexpectedly throws (fire-and-forget)', async () => {
      mockReqRepo.findOne.mockResolvedValueOnce(
        reqEntity({ id: reqId, submitterId: actor.id, status: 'collecting' }),
      )
      mockReqRepo.update.mockResolvedValue({ affected: 1 })
      mockReqRepo.findOne.mockResolvedValueOnce(
        reqEntity({ id: reqId, submitterId: actor.id, status: 'abandoned' }),
      )
      mockNotifications.notifyRequirementAbandoned.mockRejectedValueOnce(
        new Error('orchestrator down'),
      )

      const result = await service.abandonRequirement(reqId, actor, 'req-xyz')
      // 主流程响应时通知异常尚未被捕获，需要等 microtask 队列排空
      await flushMicrotasks()

      expect(result.status).toBe('abandoned')
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'requirement_abandoned',
          success: false,
          reasonCode: 'notification_orchestrator_unexpected',
        }),
      )
    })

    it('does not await notifications in main flow (HIGH-1: async decoupling)', async () => {
      mockReqRepo.findOne.mockResolvedValueOnce(
        reqEntity({ id: reqId, submitterId: actor.id, status: 'collecting' }),
      )
      mockReqRepo.update.mockResolvedValue({ affected: 1 })
      mockReqRepo.findOne.mockResolvedValueOnce(
        reqEntity({ id: reqId, submitterId: actor.id, status: 'abandoned' }),
      )
      // 通知挂起 10 秒不返回——主流程必须在该 Promise 之前返回
      let resolveNotify!: () => void
      mockNotifications.notifyRequirementAbandoned.mockReturnValueOnce(
        new Promise<void>((r) => {
          resolveNotify = r
        }),
      )

      const start = Date.now()
      const result = await service.abandonRequirement(reqId, actor, 'req-async')
      const elapsed = Date.now() - start

      expect(result.status).toBe('abandoned')
      expect(elapsed).toBeLessThan(500)
      resolveNotify()
    })

    it('rejects non-submitter from abandoning', async () => {
      mockReqRepo.findOne.mockResolvedValue(
        reqEntity({ id: reqId2, submitterId: 'other-id', status: 'collecting' }),
      )

      await expect(service.abandonRequirement(reqId2, actor, 'req-456')).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('rejects abandon when status is not collecting', async () => {
      mockReqRepo.findOne.mockResolvedValue(
        reqEntity({ id: reqId, submitterId: actor.id, status: 'received' }),
      )

      await expect(service.abandonRequirement(reqId, actor, 'req-789')).rejects.toThrow(
        BadRequestException,
      )
    })

    it('rejects non-string reason (HIGH-3: input validation)', async () => {
      await expect(
        service.abandonRequirement(reqId, actor, 'req-x', 123 as unknown as string),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects over-long reason (HIGH-3: input validation)', async () => {
      await expect(
        service.abandonRequirement(reqId, actor, 'req-x', 'x'.repeat(501)),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('is idempotent under concurrent abandon (M5: conditional UPDATE miss)', async () => {
      mockReqRepo.findOne.mockResolvedValueOnce(
        reqEntity({ id: reqId, submitterId: actor.id, status: 'collecting' }),
      )
      // 并发：条件 UPDATE 未命中 → affected = 0
      mockReqRepo.update.mockResolvedValueOnce({ affected: 0 })
      mockReqRepo.findOne.mockResolvedValueOnce(
        reqEntity({ id: reqId, submitterId: actor.id, status: 'abandoned' }),
      )

      const result = await service.abandonRequirement(reqId, actor, 'req-concurrent')
      await flushMicrotasks()

      expect(result.status).toBe('abandoned')
      // 通知不应发送（防止重复推送）
      expect(mockNotifications.notifyRequirementAbandoned).not.toHaveBeenCalled()
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'requirement_status_change',
          success: false,
          reasonCode: 'abandon_concurrent_no_op',
        }),
      )
    })

    it('throws specific error for appendMessage on abandoned requirement (AC3)', async () => {
      mockReqRepo.findOne.mockResolvedValue(
        reqEntity({ id: reqId, submitterId: actor.id, status: 'abandoned' }),
      )

      await expect(service.appendMessage(reqId, 'test message', actor, 'req-999')).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('该需求已放弃'),
        }),
      )
    })
  })

  // ========= Story 2.4：接待成功通知调度 =========
  describe('applyCollectingToReceived notification dispatch (Story 2.4)', () => {
    const flushMicrotasks = async () => {
      await new Promise<void>((resolve) => setImmediate(resolve))
    }

    const sampleEnabledBu = (id: string, threshold = 80) => ({
      id,
      name: '测试板块',
      description: '',
      functionList: [] as string[],
      deliveryManagerId: 'dm-x',
      admissionCriteria: '标准',
      admissionThreshold: threshold,
      status: 'enabled' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const completeSnapshot = (requirementId: string) => ({
      id: 'snap-1',
      requirementId,
      version: 1,
      collectedFields: {
        goalBackground: 'a',
        coreScope: 'b',
        successCriteria: 'c',
      },
    })

    const businessActor = { id: 'biz-b', role: 'business' as const }

    it('triggers notifyRequirementReceived exactly once for llm_intake path (AC1, AC3)', async () => {
      const reqId = 'req-llm-1'
      mockReqRepo.findOne.mockResolvedValue(
        reqEntity({ id: reqId, submitterId: businessActor.id, status: 'collecting', title: '自动化' }),
      )
      mockMsgRepo.save.mockImplementation(async (m: RequirementMessageEntity) => ({
        ...m,
        id: `msg-${m.role}`,
        createdAt: m.createdAt,
      }))
      mockMsgRepo.find.mockResolvedValue([
        { id: '1', requirementId: reqId, role: 'user', content: 'desc', createdAt: new Date() },
      ])
      mockLlm.complete.mockResolvedValue({
        assistantText: 'ok',
        collectedFieldsPatch: { goalBackground: 'a', coreScope: 'b', successCriteria: 'c' },
        intakeSuggestion: {
          suggestedBusinessUnitId: 'bu-1',
          projectIds: [],
          admissionScore: 92,
          admissionRationale: '匹配',
        },
      })
      mockSnapRepo.findOne.mockResolvedValue(null)
      mockReqRepo.update.mockResolvedValue({ affected: 1 })
      mockBu.listEnabled.mockResolvedValue([sampleEnabledBu('bu-1', 80)])

      await service.appendMessage(reqId, 'desc', businessActor, 'req-llm')
      await flushMicrotasks()

      expect(mockNotifications.notifyRequirementReceived).toHaveBeenCalledTimes(1)
      expect(mockNotifications.notifyRequirementReceived).toHaveBeenCalledWith(
        expect.objectContaining({
          requirementId: reqId,
          requirementTitle: '自动化',
          submitterId: businessActor.id,
          businessUnitName: '测试板块',
          admissionScore: 92,
          admissionThreshold: 80,
          source: 'llm_intake',
          recipientId: 'dm-x',
          actor: businessActor.id,
          requestId: 'req-llm',
          mentionedWecomUserIds: [],
        }),
      )
    })

    it('triggers notifyRequirementReceived exactly once for manual_patch path (AC1)', async () => {
      const reqId = 'req-manual-1'
      let findCount = 0
      mockReqRepo.findOne.mockImplementation(async () => {
        findCount++
        if (findCount === 1) {
          return reqEntity({ id: reqId, submitterId: businessActor.id, status: 'collecting', title: '手动触发' })
        }
        return reqEntity({
          id: reqId,
          submitterId: businessActor.id,
          status: 'received',
          businessUnitId: 'bu-1',
          admissionScore: 85,
          admissionRationale: '通过',
          deliveryManagerId: 'dm-x',
        })
      })
      mockBu.listEnabled.mockResolvedValue([sampleEnabledBu('bu-1', 70)])
      mockSnapRepo.findOne.mockResolvedValue(completeSnapshot(reqId))
      mockLlm.scoreIntake.mockResolvedValue({ score: 85, rationale: '通过' })
      mockReqRepo.update.mockResolvedValue({ affected: 1 })

      await service.patchIntake(reqId, 'bu-1', businessActor, 'req-manual')
      await flushMicrotasks()

      expect(mockNotifications.notifyRequirementReceived).toHaveBeenCalledTimes(1)
      const arg = mockNotifications.notifyRequirementReceived.mock.calls[0][0]
      expect(arg.source).toBe('manual_patch')
      expect(arg.admissionScore).toBe(85)
      expect(arg.admissionThreshold).toBe(70)
      expect(arg.recipientId).toBe('dm-x')
      expect(arg.businessUnitName).toBe('测试板块')
    })

    it('does NOT notify when concurrent UPDATE misses (received_concurrent_no_op) (AC5)', async () => {
      const reqId = 'req-concurrent'
      let findCount = 0
      mockReqRepo.findOne.mockImplementation(async () => {
        findCount++
        if (findCount === 1) {
          return reqEntity({ id: reqId, submitterId: businessActor.id, status: 'collecting' })
        }
        // 二次读取（getById）返回已被并发迁移的状态
        return reqEntity({
          id: reqId,
          submitterId: businessActor.id,
          status: 'received',
          businessUnitId: 'bu-1',
          admissionScore: 90,
          admissionRationale: '通过',
          deliveryManagerId: 'dm-x',
        })
      })
      mockBu.listEnabled.mockResolvedValue([sampleEnabledBu('bu-1', 80)])
      mockSnapRepo.findOne.mockResolvedValue(completeSnapshot(reqId))
      mockLlm.scoreIntake.mockResolvedValue({ score: 90, rationale: '通过' })
      // patchIntake 先调用 this.reqRepo.update(id, {...}) 更新打分字段（非条件 UPDATE，affected=1）；
      // 然后在 applyCollectingToReceived 内部的条件 UPDATE 返回 affected=0 模拟并发。
      mockReqRepo.update
        .mockResolvedValueOnce({ affected: 1 }) // 打分字段更新
        .mockResolvedValueOnce({ affected: 0 }) // 条件 UPDATE 未命中（并发）

      await service.patchIntake(reqId, 'bu-1', businessActor, 'req-race')
      await flushMicrotasks()

      expect(mockNotifications.notifyRequirementReceived).not.toHaveBeenCalled()
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'requirement_status_change',
          success: false,
          reasonCode: 'received_concurrent_no_op',
        }),
      )
    })

    it('does not await notifications in main flow: HTTP response returns before notify settles (AC8 async decoupling)', async () => {
      const reqId = 'req-async'
      let findCount = 0
      mockReqRepo.findOne.mockImplementation(async () => {
        findCount++
        if (findCount === 1) {
          return reqEntity({ id: reqId, submitterId: businessActor.id, status: 'collecting', title: '异步' })
        }
        return reqEntity({
          id: reqId,
          submitterId: businessActor.id,
          status: 'received',
          businessUnitId: 'bu-1',
          admissionScore: 90,
          admissionRationale: '通过',
          deliveryManagerId: 'dm-x',
        })
      })
      mockBu.listEnabled.mockResolvedValue([sampleEnabledBu('bu-1', 80)])
      mockSnapRepo.findOne.mockResolvedValue(completeSnapshot(reqId))
      mockLlm.scoreIntake.mockResolvedValue({ score: 90, rationale: '通过' })
      mockReqRepo.update.mockResolvedValue({ affected: 1 })

      // 通知挂起 10s 不 resolve —— 主流程必须在该 Promise 之前返回
      let resolveNotify!: () => void
      mockNotifications.notifyRequirementReceived.mockReturnValueOnce(
        new Promise<void>((r) => {
          resolveNotify = r
        }),
      )

      const start = Date.now()
      const result = await service.patchIntake(reqId, 'bu-1', businessActor, 'req-async')
      const elapsed = Date.now() - start

      expect(result.status).toBe('received')
      expect(elapsed).toBeLessThan(500)
      resolveNotify()
    })

    it('records notification_orchestrator_unexpected audit when notifyRequirementReceived throws', async () => {
      const reqId = 'req-orc'
      let findCount = 0
      mockReqRepo.findOne.mockImplementation(async () => {
        findCount++
        if (findCount === 1) {
          return reqEntity({ id: reqId, submitterId: businessActor.id, status: 'collecting' })
        }
        return reqEntity({
          id: reqId,
          submitterId: businessActor.id,
          status: 'received',
          businessUnitId: 'bu-1',
          admissionScore: 88,
          admissionRationale: '通过',
          deliveryManagerId: 'dm-x',
        })
      })
      mockBu.listEnabled.mockResolvedValue([sampleEnabledBu('bu-1', 80)])
      mockSnapRepo.findOne.mockResolvedValue(completeSnapshot(reqId))
      mockLlm.scoreIntake.mockResolvedValue({ score: 88, rationale: '通过' })
      mockReqRepo.update.mockResolvedValue({ affected: 1 })
      mockNotifications.notifyRequirementReceived.mockRejectedValueOnce(new Error('orchestrator down'))

      const result = await service.patchIntake(reqId, 'bu-1', businessActor, 'req-orc')
      await flushMicrotasks()

      expect(result.status).toBe('received')
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'requirement_received',
          success: false,
          reasonCode: 'notification_orchestrator_unexpected',
        }),
      )
    })
  })
})
