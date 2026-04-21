import { Test, TestingModule } from '@nestjs/testing'
import { IntakeBusinessUnitsController } from './intake-business-units.controller'
import { RequirementsService } from './requirements.service'
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard'
import type { RequestWithActor } from '../../common/guards/admin-auth.guard'

describe('IntakeBusinessUnitsController', () => {
  let controller: IntakeBusinessUnitsController
  const mockService = {
    listEnabledBusinessUnitsForIntake: jest.fn(),
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [IntakeBusinessUnitsController],
      providers: [{ provide: RequirementsService, useValue: mockService }],
    })
      .overrideGuard(AdminAuthGuard)
      .useValue({ canActivate: () => true })
      .compile()

    controller = moduleRef.get(IntakeBusinessUnitsController)
  })

  it('listEnabled delegates to RequirementsService with actor and request id', async () => {
    const rows = [{ id: 'bu-1', name: 'A', description: '', functionList: [] }]
    mockService.listEnabledBusinessUnitsForIntake.mockResolvedValue(rows)
    const req = { actor: { id: 'biz-1', role: 'business' } } as RequestWithActor
    await expect(controller.listEnabled(req, 'hdr-1')).resolves.toEqual(rows)
    expect(mockService.listEnabledBusinessUnitsForIntake).toHaveBeenCalledWith(req.actor, 'hdr-1')
  })
})
