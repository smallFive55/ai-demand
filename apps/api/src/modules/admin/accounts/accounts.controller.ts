import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  Put,
  UseGuards,
} from '@nestjs/common'
import { randomUUID } from 'crypto'
import type { Request } from 'express'
import { AdminAuthGuard } from '../../../common/guards/admin-auth.guard'
import { AccountsService } from './accounts.service'
import type { CreateAccountInput, UpdateAccountInput } from './accounts.types'

interface ImportRequestBody {
  items: CreateAccountInput[]
}

@Controller('admin/accounts')
@UseGuards(AdminAuthGuard)
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  list() {
    return this.accountsService.list()
  }

  @Post()
  create(
    @Body() body: CreateAccountInput,
    @Req() request: Request & { actor?: { id: string } },
    @Headers('x-request-id') requestIdHeader?: string,
  ) {
    return this.accountsService.create(
      body,
      request.actor?.id ?? 'unknown-admin',
      requestIdHeader ?? randomUUID(),
    )
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateAccountInput,
    @Req() request: Request & { actor?: { id: string } },
    @Headers('x-request-id') requestIdHeader?: string,
  ) {
    return this.accountsService.update(
      id,
      body,
      request.actor?.id ?? 'unknown-admin',
      requestIdHeader ?? randomUUID(),
    )
  }

  @Post(':id/disable')
  @HttpCode(200)
  disable(
    @Param('id') id: string,
    @Req() request: Request & { actor?: { id: string } },
    @Headers('x-request-id') requestIdHeader?: string,
  ) {
    return this.accountsService.disable(
      id,
      request.actor?.id ?? 'unknown-admin',
      requestIdHeader ?? randomUUID(),
    )
  }

  @Post('import')
  @HttpCode(200)
  import(
    @Body() body: ImportRequestBody,
    @Req() request: Request & { actor?: { id: string } },
    @Headers('x-request-id') requestIdHeader?: string,
  ) {
    return this.accountsService.import(
      body.items,
      request.actor?.id ?? 'unknown-admin',
      requestIdHeader ?? randomUUID(),
    )
  }
}
