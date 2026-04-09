import { Module } from '@nestjs/common'
import { AccountsModule } from './accounts/accounts.module'
import { RolesModule } from './roles/roles.module'

@Module({
  imports: [AccountsModule, RolesModule],
})
export class AdminModule {}
