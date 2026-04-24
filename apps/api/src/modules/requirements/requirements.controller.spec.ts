import { ForbiddenException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { RequirementsController } from './requirements.controller'
import { RequirementsService } from './requirements.service'
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard'
import type { RequestWithActor } from '../../common/guards/admin-auth.guard'

describe('RequirementsController', () => {
  let controller: RequirementsController
  const mockService = {
    create: jest.fn(),
    getById: jest.fn(),
    listMessages: jest.fn(),
    listFieldSnapshots: jest.fn(),
    appendMessage: jest.fn(),
    patchIntake: jest.fn(),
    abandonRequirement: jest.fn(),
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [RequirementsController],
      providers: [{ provide: RequirementsService, useValue: mockService }],
    })
      .overrideGuard(AdminAuthGuard)
      .useValue({ canActivate: () => true })
      .compile()

    controller = moduleRef.get(RequirementsController)
  })

  it('create delegates to service with actor and request id', async () => {
    mockService.create.mockResolvedValue({ id: 'req-1' })
    const req = { actor: { id: 'biz-1', role: 'business' } } as RequestWithActor
    await expect(controller.create(req, 'hdr-1')).resolves.toEqual({ id: 'req-1' })
    expect(mockService.create).toHaveBeenCalledWith(req.actor, 'hdr-1')
  })

  it('appendMessage passes body content', async () => {
    mockService.appendMessage.mockResolvedValue({})
    const req = { actor: { id: 'biz-1', role: 'business' } } as RequestWithActor
    await controller.appendMessage('rid', { content: 'hello' }, req, 'hdr-2')
    expect(mockService.appendMessage).toHaveBeenCalledWith('rid', 'hello', req.actor, 'hdr-2')
  })

  it('propagates ForbiddenException from service on create', async () => {
    mockService.create.mockRejectedValue(new ForbiddenException('拒绝'))
    const req = { actor: { id: 'biz-1', role: 'business' } } as RequestWithActor
    await expect(controller.create(req, 'hdr-x')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('patchIntake passes businessUnitId to service', async () => {
    mockService.patchIntake.mockResolvedValue({ id: 'rid-1' })
    const req = { actor: { id: 'biz-1', role: 'business' } } as RequestWithActor
    await expect(
      controller.patchIntake('rid-1', { businessUnitId: 'bu-9' }, req, 'hdr-p'),
    ).resolves.toEqual({ id: 'rid-1' })
    expect(mockService.patchIntake).toHaveBeenCalledWith('rid-1', 'bu-9', req.actor, 'hdr-p')
  })

  it('keeps PATCH /:id/intake response decoupled from async notification orchestration (<500ms)', async () => {
    mockService.patchIntake.mockImplementation(async () => {
      void new Promise((resolve) => setTimeout(resolve, 10_000))
      return { id: 'rid-async', status: 'received' }
    })
    const req = { actor: { id: 'biz-1', role: 'business' } } as RequestWithActor
    const start = Date.now()
    await expect(
      controller.patchIntake('rid-async', { businessUnitId: 'bu-9' }, req, 'hdr-p-async'),
    ).resolves.toEqual({ id: 'rid-async', status: 'received' })
    expect(Date.now() - start).toBeLessThan(500)
  })

  it('keeps POST /:id/messages response decoupled from async notification orchestration (<500ms)', async () => {
    mockService.appendMessage.mockImplementation(async () => {
      void new Promise((resolve) => setTimeout(resolve, 10_000))
      return {
        userMessage: { id: 'u1' },
        aiMessage: { id: 'a1' },
        collectedFields: {},
      }
    })
    const req = { actor: { id: 'biz-1', role: 'business' } } as RequestWithActor
    const start = Date.now()
    await expect(
      controller.appendMessage('rid-msg', { content: 'hello' }, req, 'hdr-msg-async'),
    ).resolves.toEqual({
      userMessage: { id: 'u1' },
      aiMessage: { id: 'a1' },
      collectedFields: {},
    })
    expect(Date.now() - start).toBeLessThan(500)
  })

  describe('abandon (Story 2.3)', () => {
    const req = {
      actor: { id: 'biz-1', role: 'business' as const },
    } as RequestWithActor

    it('delegates to service with reason from AbandonRequirementPayload body', async () => {
      mockService.abandonRequirement.mockResolvedValue({ id: 'rid-a', status: 'abandoned' })
      await expect(
        controller.abandon('rid-a', { reason: '业务优先级调整' }, req, 'hdr-a'),
      ).resolves.toEqual({ id: 'rid-a', status: 'abandoned' })
      expect(mockService.abandonRequirement).toHaveBeenCalledWith(
        'rid-a',
        req.actor,
        'hdr-a',
        '业务优先级调整',
      )
    })

    it('tolerates missing body (defaults to {}) and passes reason as undefined', async () => {
      mockService.abandonRequirement.mockResolvedValue({ id: 'rid-b' })
      // Call with body explicitly undefined to exercise default param
      await expect(
        controller.abandon('rid-b', undefined as unknown as never, req, 'hdr-b'),
      ).resolves.toEqual({ id: 'rid-b' })
      expect(mockService.abandonRequirement).toHaveBeenCalledWith(
        'rid-b',
        req.actor,
        'hdr-b',
        undefined,
      )
    })

    it('generates requestId when x-request-id header is missing', async () => {
      mockService.abandonRequirement.mockResolvedValue({ id: 'rid-c' })
      await controller.abandon('rid-c', {}, req)
      const generatedReqId = mockService.abandonRequirement.mock.calls[0][2]
      expect(typeof generatedReqId).toBe('string')
      expect(generatedReqId.length).toBeGreaterThan(0)
    })

    it('propagates service ForbiddenException (non-submitter)', async () => {
      mockService.abandonRequirement.mockRejectedValue(new ForbiddenException('非提交者'))
      await expect(
        controller.abandon('rid-d', {}, req, 'hdr-d'),
      ).rejects.toBeInstanceOf(ForbiddenException)
    })
  })
})
