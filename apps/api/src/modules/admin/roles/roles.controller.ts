import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
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
import { RolesService } from './roles.service'
import type { CreateRoleInput, PermissionEntry, UpdateRoleInput } from './roles.types'

interface UpdatePermissionsBody {
  permissions: PermissionEntry[]
}

@Controller('admin/roles')
@UseGuards(AdminAuthGuard, PermissionGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermission('admin.role', 'read')
  list() {
    return this.rolesService.list()
  }

  @Get(':id')
  @RequirePermission('admin.role', 'read')
  getById(@Param('id') id: string) {
    return this.rolesService.getById(id)
  }

  @Post()
  @RequirePermission('admin.role', 'manage')
  create(
    @Body() body: CreateRoleInput,
    @Req() request: Request & { actor?: { id: string } },
    @Headers('x-request-id') requestIdHeader?: string,
  ) {
    return this.rolesService.create(
      body,
      request.actor?.id ?? 'unknown-admin',
      requestIdHeader ?? randomUUID(),
    )
  }

  @Put(':id')
  @RequirePermission('admin.role', 'manage')
  update(
    @Param('id') id: string,
    @Body() body: UpdateRoleInput,
    @Req() request: Request & { actor?: { id: string } },
    @Headers('x-request-id') requestIdHeader?: string,
  ) {
    return this.rolesService.update(
      id,
      body,
      request.actor?.id ?? 'unknown-admin',
      requestIdHeader ?? randomUUID(),
    )
  }

  @Post(':id/disable')
  @HttpCode(200)
  @RequirePermission('admin.role', 'manage')
  disable(
    @Param('id') id: string,
    @Req() request: Request & { actor?: { id: string } },
    @Headers('x-request-id') requestIdHeader?: string,
  ) {
    return this.rolesService.disable(
      id,
      request.actor?.id ?? 'unknown-admin',
      requestIdHeader ?? randomUUID(),
    )
  }

  @Post(':id/enable')
  @HttpCode(200)
  @RequirePermission('admin.role', 'manage')
  enable(
    @Param('id') id: string,
    @Req() request: Request & { actor?: { id: string } },
    @Headers('x-request-id') requestIdHeader?: string,
  ) {
    return this.rolesService.enable(
      id,
      request.actor?.id ?? 'unknown-admin',
      requestIdHeader ?? randomUUID(),
    )
  }

  @Put(':id/permissions')
  @RequirePermission('admin.role', 'manage')
  updatePermissions(
    @Param('id') id: string,
    @Body() body: UpdatePermissionsBody,
    @Req() request: Request & { actor?: { id: string } },
    @Headers('x-request-id') requestIdHeader?: string,
  ) {
    return this.rolesService.updatePermissions(
      id,
      body.permissions,
      request.actor?.id ?? 'unknown-admin',
      requestIdHeader ?? randomUUID(),
    )
  }
}
