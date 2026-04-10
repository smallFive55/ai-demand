import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { AdminAuthGuard, type RequestWithActor } from '../../common/guards/admin-auth.guard'
import { AuthService } from './auth.service'
import type { LoginInput } from './auth.types'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginInput) {
    if (!body?.username?.trim() || !body?.password) {
      throw new BadRequestException('用户名和密码不能为空')
    }
    return this.authService.login(body.username, body.password)
  }

  @Post('change-password')
  @HttpCode(200)
  @UseGuards(AdminAuthGuard)
  async changePassword(
    @Body() body: { currentPassword?: string; newPassword?: string },
    @Req() req: RequestWithActor,
  ) {
    const actor = req.actor
    if (!actor?.id) {
      throw new BadRequestException('无法识别当前用户')
    }
    if (!body?.currentPassword || !body?.newPassword?.trim()) {
      throw new BadRequestException('请填写当前密码与新密码')
    }
    await this.authService.changePassword(actor.id, body.currentPassword, body.newPassword)
    return { ok: true as const }
  }

  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() body: { email?: string }) {
    const email = body?.email?.trim()
    if (!email) {
      throw new BadRequestException('请填写注册时使用的邮箱')
    }
    await this.authService.requestPasswordReset(email)
    return { ok: true as const }
  }

  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() body: { token?: string; newPassword?: string }) {
    if (!body?.token?.trim() || !body?.newPassword?.trim()) {
      throw new BadRequestException('请填写重置令牌与新密码')
    }
    await this.authService.resetPasswordWithToken(body.token, body.newPassword)
    return { ok: true as const }
  }
}
