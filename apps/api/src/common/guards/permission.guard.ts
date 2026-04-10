import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PERMISSION_KEY } from '../decorators/require-permission.decorator'
import type { RequestWithActor } from './admin-auth.guard'
import { RolesService } from '../../modules/admin/roles/roles.service'

interface PermissionMeta {
  resource: string
  action: string
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rolesService: RolesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<PermissionMeta | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    )

    if (!meta) return true

    const request = context.switchToHttp().getRequest<RequestWithActor>()
    const actor = request.actor
    if (!actor) {
      throw new ForbiddenException('缺少身份信息，无法校验权限')
    }

    const role = await this.rolesService.getByName(actor.role)
    if (!role || role.status !== 'enabled') {
      throw new ForbiddenException('当前角色不存在或已禁用，无权访问')
    }

    if (!this.rolesService.roleAllowsPermission(role, meta.resource, meta.action)) {
      throw new ForbiddenException(
        `无权执行操作 ${meta.resource}.${meta.action}`,
      )
    }

    return true
  }
}
