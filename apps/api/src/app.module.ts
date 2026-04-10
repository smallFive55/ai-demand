import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { DatabaseModule } from './database/database.module'
import { AdminModule } from './modules/admin/admin.module'
import { AuthModule } from './modules/auth/auth.module'
import { RequirementsModule } from './modules/requirements/requirements.module'

@Module({
  imports: [DatabaseModule, AuthModule, AdminModule, RequirementsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
