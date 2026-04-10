import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BusinessUnitEntity } from '../../../database/entities/business-unit.entity'
import { AuditModule } from '../../audit/audit.module'
import { AccountsModule } from '../accounts/accounts.module'
import { RolesModule } from '../roles/roles.module'
import { BusinessUnitsController } from './business-units.controller'
import { BusinessUnitsService } from './business-units.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([BusinessUnitEntity]),
    AuditModule,
    AccountsModule,
    RolesModule,
  ],
  controllers: [BusinessUnitsController],
  providers: [BusinessUnitsService],
  exports: [BusinessUnitsService],
})
export class BusinessUnitsModule {}
