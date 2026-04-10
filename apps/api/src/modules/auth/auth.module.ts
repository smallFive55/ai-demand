import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard'
import { AdminAuthUserEntity } from '../../database/entities/admin-auth-user.entity'
import { PasswordResetTokenEntity } from '../../database/entities/password-reset-token.entity'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { MailService } from './mail.service'

@Module({
  imports: [TypeOrmModule.forFeature([AdminAuthUserEntity, PasswordResetTokenEntity])],
  controllers: [AuthController],
  providers: [AuthService, MailService, AdminAuthGuard],
})
export class AuthModule {}
