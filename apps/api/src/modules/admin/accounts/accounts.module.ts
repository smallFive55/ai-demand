import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AdminAccountEntity } from '../../../database/entities/admin-account.entity'
import { AdminAuthUserEntity } from '../../../database/entities/admin-auth-user.entity'
import { AuditModule } from '../../audit/audit.module'
import { RolesModule } from '../roles/roles.module'
import { AccountsController } from './accounts.controller'
import { AccountsService } from './accounts.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminAccountEntity, AdminAuthUserEntity]),
    AuditModule,
    RolesModule,
  ],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
