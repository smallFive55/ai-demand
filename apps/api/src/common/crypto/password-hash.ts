import { randomUUID, scryptSync } from 'crypto'

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex')
}

export function newPasswordSalt(): string {
  return randomUUID()
}
