import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID, scryptSync, timingSafeEqual } from 'crypto'
import { Repository } from 'typeorm'
import { AdminAuthUserEntity } from '../../database/entities/admin-auth-user.entity'
import type { LoginResult } from './auth.types'

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @InjectRepository(AdminAuthUserEntity)
    private readonly userRepo: Repository<AdminAuthUserEntity>,
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

    const passwordHash = this.hashPassword(password, user.passwordSalt)
    const expected = Buffer.from(user.passwordHash, 'hex')
    const actual = Buffer.from(passwordHash, 'hex')
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new UnauthorizedException('用户名或密码错误')
    }

    const tokenPrefix =
      user.roleName === 'business'
        ? 'business'
        : user.roleName === 'delivery_manager'
          ? 'delivery_manager'
          : user.roleName === 'admin'
            ? 'admin'
            : 'admin'

    return {
      token: `${tokenPrefix}:${user.id}`,
      user: {
        id: user.id,
        name: user.displayName,
        role: user.roleName,
      },
    }
  }

  private async seedDefaultAdmin() {
    const n = await this.userRepo.count()
    if (n > 0) return

    const now = new Date()
    const username = (process.env.ADMIN_INIT_USERNAME ?? 'admin').trim().toLowerCase()
    const displayName = process.env.ADMIN_INIT_DISPLAY_NAME?.trim() || '系统管理员'
    const password = process.env.ADMIN_INIT_PASSWORD ?? 'admin123456'
    const salt = randomUUID()

    await this.userRepo.save({
      id: 'seed-admin',
      username,
      displayName,
      roleName: 'admin',
      status: 'enabled',
      passwordHash: this.hashPassword(password, salt),
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
    const salt = randomUUID()

    await this.userRepo.save({
      id: 'seed-business',
      username,
      displayName,
      roleName: 'business',
      status: 'enabled',
      passwordHash: this.hashPassword(password, salt),
      passwordSalt: salt,
      createdAt: now,
      updatedAt: now,
    })
  }

  private hashPassword(password: string, salt: string): string {
    return scryptSync(password, salt, 64).toString('hex')
  }
}
