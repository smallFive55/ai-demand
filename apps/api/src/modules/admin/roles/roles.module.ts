import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AdminRoleEntity } from '../../../database/entities/admin-role.entity'
import { AuditModule } from '../../audit/audit.module'
import { RolesController } from './roles.controller'
import { RolesService } from './roles.service'

@Module({
  imports: [TypeOrmModule.forFeature([AdminRoleEntity]), AuditModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
