import { ForbiddenException, GatewayTimeoutException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { RequirementFieldSnapshotEntity } from '../../database/entities/requirement-field-snapshot.entity'
import { RequirementMessageEntity } from '../../database/entities/requirement-message.entity'
import { RequirementEntity } from '../../database/entities/requirement.entity'
import { AuditService } from '../audit/audit.service'
import { LLM_CHAT } from './llm/llm-chat.port'
import { RequirementsService } from './requirements.service'

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
    mockReqRepo.findOne.mockImplementation(async () => ({
      id: savedId,
      title: '新需求草稿',
      status: 'collecting',
      submitterId: actor.id,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }))
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

    mockReqRepo.findOne.mockResolvedValue({
      id: reqId,
      title: '新需求草稿',
      status: 'collecting',
      submitterId: actor.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
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

  it('maps LLM AbortError to GatewayTimeoutException', async () => {
    const actor = { id: 'biz-d', role: 'business' as const }
    const reqId = '44444444-4444-4444-4444-444444444444'

    mockReqRepo.findOne.mockResolvedValue({
      id: reqId,
      title: '新需求草稿',
      status: 'collecting',
      submitterId: actor.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
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

    mockReqRepo.findOne.mockResolvedValue({
      id: reqId,
      title: '新需求草稿',
      status: 'collecting',
      submitterId: actor.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
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
    mockReqRepo.findOne.mockResolvedValue({
      id: 'rid',
      title: 't',
      status: 'collecting',
      submitterId: 'owner',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await expect(
      service.getById('rid', { id: 'other', role: 'business' }, 'r'),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('allows read for admin role (traceability)', async () => {
    mockReqRepo.findOne.mockResolvedValue({
      id: 'rid',
      title: 't',
      status: 'collecting',
      submitterId: 'owner',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    mockSnapRepo.findOne.mockResolvedValue(null)
    const row = await service.getById('rid', { id: 'adm', role: 'admin' }, 'r')
    expect(row.id).toBe('rid')
    expect(row.submitterId).toBe('owner')
  })

  it('allows read for delivery_manager role (traceability)', async () => {
    mockReqRepo.findOne.mockResolvedValue({
      id: 'rid2',
      title: 't2',
      status: 'collecting',
      submitterId: 'owner',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    mockSnapRepo.findOne.mockResolvedValue(null)
    const row = await service.getById('rid2', { id: 'dm1', role: 'delivery_manager' }, 'r')
    expect(row.id).toBe('rid2')
  })

  it('denies read for unknown role', async () => {
    mockReqRepo.findOne.mockResolvedValue({
      id: 'rid',
      title: 't',
      status: 'collecting',
      submitterId: 'owner',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await expect(
      service.getById('rid', { id: 'x', role: 'unknown_role' }, 'r'),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })
})
