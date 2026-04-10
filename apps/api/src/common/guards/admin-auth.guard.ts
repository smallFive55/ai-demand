/**
 * 解析 Bearer 令牌并将 `actor`（id + role）挂到 request。
 * 名称含 Admin 为历史原因：实际支持 admin / business / delivery_manager 等任意业务角色（见 `business:` 等前缀）。
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request } from 'express'

interface AuthActor {
  id: string
  role: string
}

export interface RequestWithActor extends Request {
  actor?: AuthActor
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithActor>()
    const authorization = request.headers['authorization']
    if (!authorization || typeof authorization !== 'string') {
      throw new UnauthorizedException('缺少 Authorization 令牌')
    }

    const token = this.extractBearerToken(authorization)
    const actor = this.parseActor(token)
    request.actor = actor
    return true
  }

  private extractBearerToken(authorization: string) {
    const [scheme, token] = authorization.split(' ')
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Authorization 格式应为 Bearer <token>')
    }
    return token.trim()
  }

  private parseActor(token: string): AuthActor {
    if (token === 'dev-admin-token') {
      return { id: 'dev-admin', role: 'admin' }
    }

    if (token.startsWith('admin:')) {
      const actorId = token.slice('admin:'.length)
      return { id: actorId || 'admin-user', role: 'admin' }
    }

    if (token.startsWith('business:')) {
      const actorId = token.slice('business:'.length)
      return { id: actorId || 'business-user', role: 'business' }
    }

    if (token.startsWith('delivery_manager:')) {
      const actorId = token.slice('delivery_manager:'.length)
      return { id: actorId || 'delivery-manager', role: 'delivery_manager' }
    }

    if (token.includes('.')) {
      try {
        const payload = token.split('.')[1]
        if (!payload) {
          throw new UnauthorizedException('令牌无效')
        }
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
        const json = Buffer.from(padded, 'base64').toString('utf8')
        const parsed = JSON.parse(json) as { sub?: string; userId?: string; role?: string }
        return {
          id: parsed.sub ?? parsed.userId ?? 'admin-user',
          role: parsed.role ?? 'unknown',
        }
      } catch {
        throw new UnauthorizedException('令牌解析失败')
      }
    }

    throw new UnauthorizedException('无法识别的令牌格式')
  }
}
