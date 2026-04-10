import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common'
import { randomUUID } from 'crypto'
import type { Request } from 'express'
import { RequirePermission } from '../../../common/decorators/require-permission.decorator'
import { AdminAuthGuard } from '../../../common/guards/admin-auth.guard'
import { PermissionGuard } from '../../../common/guards/permission.guard'
import { BusinessUnitsService } from './business-units.service'
import type { CreateBizUnitInput, UpdateBizUnitInput } from './business-units.types'

@Controller('admin/business-units')
@UseGuards(AdminAuthGuard, PermissionGuard)
export class BusinessUnitsController {
  constructor(private readonly businessUnitsService: BusinessUnitsService) {}

  @Get()
  @RequirePermission('admin.businessUnit', 'read')
  async list() {
    return this.businessUnitsService.list()
  }

  /** 仅返回启用板块，供需求接待等下游读取（须在 :id 之前注册） */
  @Get('enabled')
  @RequirePermission('admin.businessUnit', 'read')
  async listEnabled() {
    return this.businessUnitsService.listEnabled()
  }

  @Get(':id')
  @RequirePermission('admin.businessUnit', 'read')
  async getById(@Param('id') id: string) {
    const unit = await this.businessUnitsService.getById(id)
    if (!unit) {
      throw new NotFoundException('业务板块不存在')
    }
    return unit
  }

  @Post()
  @RequirePermission('admin.businessUnit', 'create')
  async create(
    @Body() body: CreateBizUnitInput,
    @Req() request: Request & { actor?: { id: string } },
    @Headers('x-request-id') requestIdHeader?: string,
  ) {
    return await this.businessUnitsService.create(
      body,
      request.actor?.id ?? 'unknown-admin',
      requestIdHeader ?? randomUUID(),
    )
  }

  @Put(':id')
  @RequirePermission('admin.businessUnit', 'update')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateBizUnitInput,
    @Req() request: Request & { actor?: { id: string } },
    @Headers('x-request-id') requestIdHeader?: string,
  ) {
    return await this.businessUnitsService.update(
      id,
      body,
      request.actor?.id ?? 'unknown-admin',
      requestIdHeader ?? randomUUID(),
    )
  }

  @Post(':id/disable')
  @HttpCode(200)
  @RequirePermission('admin.businessUnit', 'disable')
  async disable(
    @Param('id') id: string,
    @Req() request: Request & { actor?: { id: string } },
    @Headers('x-request-id') requestIdHeader?: string,
  ) {
    return await this.businessUnitsService.disable(
      id,
      request.actor?.id ?? 'unknown-admin',
      requestIdHeader ?? randomUUID(),
    )
  }

  @Post(':id/enable')
  @HttpCode(200)
  @RequirePermission('admin.businessUnit', 'enable')
  async enable(
    @Param('id') id: string,
    @Req() request: Request & { actor?: { id: string } },
    @Headers('x-request-id') requestIdHeader?: string,
  ) {
    return await this.businessUnitsService.enable(
      id,
      request.actor?.id ?? 'unknown-admin',
      requestIdHeader ?? randomUUID(),
    )
  }
}
