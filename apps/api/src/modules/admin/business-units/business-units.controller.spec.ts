import { Test, TestingModule } from '@nestjs/testing'
import { AdminAuthGuard } from '../../../common/guards/admin-auth.guard'
import { PermissionGuard } from '../../../common/guards/permission.guard'
import { BusinessUnitsController } from './business-units.controller'
import { BusinessUnitsService } from './business-units.service'

describe('BusinessUnitsController', () => {
  let controller: BusinessUnitsController
  const mockService = {
    list: jest.fn(),
    listEnabled: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BusinessUnitsController],
      providers: [{ provide: BusinessUnitsService, useValue: mockService }],
    })
      .overrideGuard(AdminAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile()

    controller = module.get(BusinessUnitsController)
  })

  it('list delegates to service.list', async () => {
    mockService.list.mockResolvedValue([])
    await expect(controller.list()).resolves.toEqual([])
    expect(mockService.list).toHaveBeenCalledTimes(1)
  })

  it('listEnabled delegates to service.listEnabled', async () => {
    mockService.listEnabled.mockResolvedValue([{ id: '1' }])
    await expect(controller.listEnabled()).resolves.toEqual([{ id: '1' }])
    expect(mockService.listEnabled).toHaveBeenCalledTimes(1)
  })
})
