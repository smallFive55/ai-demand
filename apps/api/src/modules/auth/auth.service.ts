import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import { Repository } from 'typeorm'
import { hashPassword, newPasswordSalt } from '../../common/crypto/password-hash'
import { AdminAuthUserEntity } from '../../database/entities/admin-auth-user.entity'
import { PasswordResetTokenEntity } from '../../database/entities/password-reset-token.entity'
import type { LoginResult } from './auth.types'
import { MailService } from './mail.service'

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @InjectRepository(AdminAuthUserEntity)
    private readonly userRepo: Repository<AdminAuthUserEntity>,
    @InjectRepository(PasswordResetTokenEntity)
    private readonly resetRepo: Repository<PasswordResetTokenEntity>,
    private readonly mailService: MailService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultAdmin()
    await this.seedBusinessUser()
  }

  async login(username: string, password: string): Promise<LoginResult> {
    const normalized = username.trim().toLowerCase()
    const user = await this.userRepo.findOne({ where: { username: normalized } })

    if (!user || user.status !== 'enabled') {
      throw new UnauthorizedException('用户名或密码错误')
    }

    const passwordHash = hashPassword(password, user.passwordSalt)
    const expected = Buffer.from(user.passwordHash, 'hex')
    const actual = Buffer.from(passwordHash, 'hex')
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new UnauthorizedException('用户名或密码错误')
    }

    return {
      token: `${user.roleName}:${user.id}`,
      user: {
        id: user.id,
        name: user.displayName,
        role: user.roleName,
      },
    }
  }

  async changePassword(actorId: string, currentPassword: string, newPassword: string): Promise<void> {
    const np = newPassword?.trim() ?? ''
    if (np.length < 8) {
      throw new BadRequestException('新密码长度至少 8 位')
    }

    const user = await this.userRepo.findOne({ where: { id: actorId } })
    if (!user || user.status !== 'enabled') {
      throw new BadRequestException('未找到可修改密码的登录用户，请联系管理员')
    }

    const currentHash = hashPassword(currentPassword, user.passwordSalt)
    const expected = Buffer.from(user.passwordHash, 'hex')
    const actual = Buffer.from(currentHash, 'hex')
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new BadRequestException('当前密码不正确')
    }

    const salt = newPasswordSalt()
    const nextHash = hashPassword(np, salt)
    const now = new Date()
    await this.userRepo.update(actorId, {
      passwordHash: nextHash,
      passwordSalt: salt,
      updatedAt: now,
    })
  }

  /**
   * 忘记密码：按登录用户名（通常为邮箱）查找用户，签发一次性令牌并尝试发信。
   * 未注册邮箱时静默成功，避免枚举。
   */
  async requestPasswordReset(emailRaw: string): Promise<void> {
    const email = emailRaw.trim().toLowerCase()
    if (!email) {
      return
    }

    const user = await this.userRepo.findOne({ where: { username: email } })
    if (!user || user.status !== 'enabled') {
      return
    }

    await this.resetRepo
      .createQueryBuilder()
      .delete()
      .where('user_id = :uid', { uid: user.id })
      .andWhere('used_at IS NULL')
      .execute()

    const rawToken = randomBytes(32).toString('base64url')
    const tokenHash = this.hashResetToken(rawToken)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MS)

    await this.resetRepo.save({
      id: randomUUID(),
      userId: user.id,
      tokenHash,
      expiresAt,
      usedAt: null,
      createdAt: now,
    })

    const base = (process.env.APP_PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, '')
    const resetUrl = `${base}/reset-password?token=${encodeURIComponent(rawToken)}`

    await this.mailService.sendPasswordResetEmail(user.username, resetUrl)
  }

  async resetPasswordWithToken(rawToken: string, newPassword: string): Promise<void> {
    const np = newPassword?.trim() ?? ''
    if (np.length < 8) {
      throw new BadRequestException('新密码长度至少 8 位')
    }
    const trimmed = rawToken?.trim() ?? ''
    if (!trimmed) {
      throw new BadRequestException('重置令牌无效或已过期')
    }

    const tokenHash = this.hashResetToken(trimmed)
    const row = await this.resetRepo.findOne({ where: { tokenHash } })
    if (!row || row.usedAt) {
      throw new BadRequestException('重置令牌无效或已过期')
    }
    if (row.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('重置令牌无效或已过期')
    }

    const user = await this.userRepo.findOne({ where: { id: row.userId } })
    if (!user || user.status !== 'enabled') {
      throw new BadRequestException('重置令牌无效或已过期')
    }

    const salt = newPasswordSalt()
    const pwdHash = hashPassword(np, salt)
    const now = new Date()

    await this.userRepo.manager.transaction(async (em) => {
      await em.getRepository(AdminAuthUserEntity).update(user.id, {
        passwordHash: pwdHash,
        passwordSalt: salt,
        updatedAt: now,
      })
      await em.getRepository(PasswordResetTokenEntity).update(row.id, {
        usedAt: now,
      })
    })
  }

  private hashResetToken(raw: string): string {
    return createHash('sha256').update(raw, 'utf8').digest('hex')
  }

  private async seedDefaultAdmin() {
    const n = await this.userRepo.count()
    if (n > 0) return

    const now = new Date()
    const username = (process.env.ADMIN_INIT_USERNAME ?? 'admin').trim().toLowerCase()
    const displayName = process.env.ADMIN_INIT_DISPLAY_NAME?.trim() || '系统管理员'
    const password = process.env.ADMIN_INIT_PASSWORD ?? 'admin123456'
    const salt = newPasswordSalt()

    await this.userRepo.save({
      id: 'seed-admin',
      username,
      displayName,
      roleName: 'admin',
      status: 'enabled',
      passwordHash: hashPassword(password, salt),
      passwordSalt: salt,
      createdAt: now,
      updatedAt: now,
    })
  }

  /** 业务方联调账号（与 admin 种子独立，可按用户名幂等创建） */
  private async seedBusinessUser() {
    const username = (process.env.BUSINESS_INIT_USERNAME ?? 'business').trim().toLowerCase()
    const existing = await this.userRepo.findOne({ where: { username } })
    if (existing) return

    const now = new Date()
    const displayName = process.env.BUSINESS_INIT_DISPLAY_NAME?.trim() || '业务方（演示）'
    const password = process.env.BUSINESS_INIT_PASSWORD ?? 'business123456'
    const salt = newPasswordSalt()

    await this.userRepo.save({
      id: 'seed-business',
      username,
      displayName,
      roleName: 'business',
      status: 'enabled',
      passwordHash: hashPassword(password, salt),
      passwordSalt: salt,
      createdAt: now,
      updatedAt: now,
    })
  }
}
