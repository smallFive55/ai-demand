import { Injectable, UnauthorizedException } from '@nestjs/common'
import { randomUUID, scryptSync, timingSafeEqual } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import type { AuthUser, LoginResult } from './auth.types'

@Injectable()
export class AuthService {
  private readonly users = new Map<string, AuthUser>()
  private readonly dataFile = resolve(
    process.cwd(),
    process.env.ADMIN_USERS_DATA_FILE ?? '.runtime-data/admin-users.json',
  )

  constructor() {
    this.loadFromDisk()
    this.seedDefaultAdmin()
  }

  login(username: string, password: string): LoginResult {
    const normalized = username.trim().toLowerCase()
    const user = Array.from(this.users.values()).find(
      (candidate) => candidate.username === normalized,
    )

    if (!user || user.status !== 'enabled') {
      throw new UnauthorizedException('用户名或密码错误')
    }

    const passwordHash = this.hashPassword(password, user.passwordSalt)
    const expected = Buffer.from(user.passwordHash, 'hex')
    const actual = Buffer.from(passwordHash, 'hex')
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new UnauthorizedException('用户名或密码错误')
    }

    return {
      token: `admin:${user.id}`,
      user: {
        id: user.id,
        name: user.displayName,
        role: user.role,
      },
    }
  }

  private seedDefaultAdmin() {
    if (this.users.size > 0) return

    const now = new Date().toISOString()
    const username = (process.env.ADMIN_INIT_USERNAME ?? 'admin').trim().toLowerCase()
    const displayName = process.env.ADMIN_INIT_DISPLAY_NAME?.trim() || '系统管理员'
    const password = process.env.ADMIN_INIT_PASSWORD ?? 'admin123456'
    const salt = randomUUID()

    const user: AuthUser = {
      id: 'seed-admin',
      username,
      displayName,
      role: 'admin',
      status: 'enabled',
      passwordHash: this.hashPassword(password, salt),
      passwordSalt: salt,
      createdAt: now,
      updatedAt: now,
    }

    this.users.set(user.id, user)
    this.persist()
  }

  private hashPassword(password: string, salt: string): string {
    return scryptSync(password, salt, 64).toString('hex')
  }

  private loadFromDisk() {
    if (!existsSync(this.dataFile)) return
    const raw = readFileSync(this.dataFile, 'utf8')
    if (!raw.trim()) return
    const parsed = JSON.parse(raw) as AuthUser[]
    parsed.forEach((user) => this.users.set(user.id, user))
  }

  private persist() {
    mkdirSync(dirname(this.dataFile), { recursive: true })
    writeFileSync(
      this.dataFile,
      JSON.stringify(Array.from(this.users.values()), null, 2),
      'utf8',
    )
  }
}
