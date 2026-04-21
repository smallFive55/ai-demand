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
})
