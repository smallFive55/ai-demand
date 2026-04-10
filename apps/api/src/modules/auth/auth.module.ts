import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AdminAuthUserEntity } from '../../database/entities/admin-auth-user.entity'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'

@Module({
  imports: [TypeOrmModule.forFeature([AdminAuthUserEntity])],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
