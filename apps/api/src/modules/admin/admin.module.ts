import { Module } from '@nestjs/common'
import { AccountsModule } from './accounts/accounts.module'
import { BusinessUnitsModule } from './business-units/business-units.module'
import { RolesModule } from './roles/roles.module'

@Module({
  imports: [AccountsModule, RolesModule, BusinessUnitsModule],
})
export class AdminModule {}
