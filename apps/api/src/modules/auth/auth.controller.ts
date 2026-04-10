import { BadRequestException, Body, Controller, HttpCode, Post } from '@nestjs/common'
import { AuthService } from './auth.service'
import type { LoginInput } from './auth.types'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginInput) {
    if (!body?.username?.trim() || !body?.password) {
      throw new BadRequestException('用户名和密码不能为空')
    }
    return this.authService.login(body.username, body.password)
  }
}
