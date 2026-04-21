import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { randomUUID } from 'crypto'
import { AdminAuthGuard, type RequestWithActor } from '../../common/guards/admin-auth.guard'
import { RequirementsService } from './requirements.service'

@Controller('v1/requirements')
@UseGuards(AdminAuthGuard)
export class RequirementsController {
  constructor(private readonly requirementsService: RequirementsService) {}

  @Post()
  @HttpCode(201)
  async create(
    @Req() request: RequestWithActor,
    @Headers('x-request-id') requestIdHeader?: string,
  ) {
    const requestId = requestIdHeader ?? randomUUID()
    return this.requirementsService.create(request.actor, requestId)
  }

  @Get(':id')
  async getById(
    @Param('id') id: string,
    @Req() request: RequestWithActor,
    @Headers('x-request-id') requestIdHeader?: string,
  ) {
    const requestId = requestIdHeader ?? randomUUID()
    return this.requirementsService.getById(id, request.actor, requestId)
  }

  @Patch(':id/intake')
  @HttpCode(200)
  async patchIntake(
    @Param('id') id: string,
    @Body() body: { businessUnitId?: string },
    @Req() request: RequestWithActor,
    @Headers('x-request-id') requestIdHeader?: string,
  ) {
    const requestId = requestIdHeader ?? randomUUID()
    return this.requirementsService.patchIntake(id, body?.businessUnitId ?? '', request.actor, requestId)
  }

  @Get(':id/messages')
  async listMessages(
    @Param('id') id: string,
    @Req() request: RequestWithActor,
    @Headers('x-request-id') requestIdHeader?: string,
    @Query('limit') limit?: string,
  ) {
    const requestId = requestIdHeader ?? randomUUID()
    const n = limit != null ? parseInt(limit, 10) : 500
    return this.requirementsService.listMessages(id, request.actor, requestId, Number.isFinite(n) ? n : 500)
  }

  @Get(':id/field-snapshots')
  async listFieldSnapshots(
    @Param('id') id: string,
    @Req() request: RequestWithActor,
    @Headers('x-request-id') requestIdHeader?: string,
  ) {
    const requestId = requestIdHeader ?? randomUUID()
    return this.requirementsService.listFieldSnapshots(id, request.actor, requestId)
  }

  @Post(':id/messages')
  @HttpCode(200)
  async appendMessage(
    @Param('id') id: string,
    @Body() body: { content?: string },
    @Req() request: RequestWithActor,
    @Headers('x-request-id') requestIdHeader?: string,
  ) {
    const requestId = requestIdHeader ?? randomUUID()
    return this.requirementsService.appendMessage(id, body?.content ?? '', request.actor, requestId)
  }

  @Patch(':id/abandon')
  @HttpCode(200)
  async abandon(
    @Param('id') id: string,
    @Body() body: { reason?: string } = {},
    @Req() request: RequestWithActor,
    @Headers('x-request-id') requestIdHeader?: string,
  ) {
    const requestId = requestIdHeader ?? randomUUID()
    return this.requirementsService.abandonRequirement(
      id,
      request.actor,
      requestId,
      body?.reason,
    )
  }
}
