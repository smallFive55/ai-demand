import { Controller, Get, Headers, Req, UseGuards } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { AdminAuthGuard, type RequestWithActor } from '../../common/guards/admin-auth.guard'
import { RequirementsService } from './requirements.service'

/** 业务方可访问的启用板块列表（非管理员 /admin 路径） */
@Controller('v1/business-units')
@UseGuards(AdminAuthGuard)
export class IntakeBusinessUnitsController {
  constructor(private readonly requirementsService: RequirementsService) {}

  @Get('enabled')
  async listEnabled(
    @Req() request: RequestWithActor,
    @Headers('x-request-id') requestIdHeader?: string,
  ) {
    const requestId = requestIdHeader ?? randomUUID()
    return this.requirementsService.listEnabledBusinessUnitsForIntake(request.actor, requestId)
  }
}
