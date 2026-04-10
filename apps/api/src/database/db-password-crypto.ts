import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto'

/** 与 .env 中 DB_PASSWORD 搭配：密文以此前缀开头 */
export const ENCRYPTED_DB_PASSWORD_PREFIX = 'enc1:'

const SALT_LEN = 16
const IV_LEN = 12
const TAG_LEN = 16
const SCRYPT_OPTS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
} as const

function deriveKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, 32, SCRYPT_OPTS)
}

export function encryptDbPassword(plaintext: string, secret: string): string {
  const salt = randomBytes(SALT_LEN)
  const key = deriveKey(secret, salt)
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const payload = Buffer.concat([salt, iv, enc, tag])
  return ENCRYPTED_DB_PASSWORD_PREFIX + payload.toString('base64')
}

/** 去掉首尾空白，并去掉一层成对的外层 ASCII 单/双引号（与 .env 常见写法对齐）。 */
export function normalizeDbPasswordSecret(raw: string): string {
  const t = raw.trim()
  if (t.length >= 2) {
    const a = t[0]
    const b = t[t.length - 1]
    if ((a === "'" && b === "'") || (a === '"' && b === '"')) {
      return t.slice(1, -1)
    }
  }
  return t
}

/** 与 CMD `set VAR='x'`（引号进入变量值）及 .env 无引号解析等场景对齐，依次尝试。 */
function dbPasswordSecretTryValues(secretRaw: string): string[] {
  const t = secretRaw.trim()
  const inner = normalizeDbPasswordSecret(secretRaw)
  const out: string[] = []
  const seen = new Set<string>()
  const push = (x: string) => {
    if (x.length === 0 || seen.has(x)) return
    seen.add(x)
    out.push(x)
  }
  push(t)
  push(inner)
  push(`'${inner}'`)
  push(`"${inner}"`)
  return out
}

export function decryptDbPassword(
  valueWithPrefix: string,
  secret: string,
): string {
  if (!valueWithPrefix.startsWith(ENCRYPTED_DB_PASSWORD_PREFIX)) {
    throw new Error('Not an enc1: ciphertext')
  }
  const raw = Buffer.from(
    valueWithPrefix.slice(ENCRYPTED_DB_PASSWORD_PREFIX.length),
    'base64',
  )
  if (raw.length < SALT_LEN + IV_LEN + TAG_LEN + 1) {
    throw new Error('Ciphertext too short')
  }
  const salt = raw.subarray(0, SALT_LEN)
  const iv = raw.subarray(SALT_LEN, SALT_LEN + IV_LEN)
  const tag = raw.subarray(raw.length - TAG_LEN)
  const ciphertext = raw.subarray(SALT_LEN + IV_LEN, raw.length - TAG_LEN)
  const key = deriveKey(secret, salt)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return (
    decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8')
  )
}

/**
 * 解析 DB_PASSWORD：明文原样返回；enc1: 密文需配置 DB_PASSWORD_SECRET。
 */
export function resolveDbPasswordFromEnv(): string {
  const raw = (process.env.DB_PASSWORD ?? '').trim()
  if (!raw.startsWith(ENCRYPTED_DB_PASSWORD_PREFIX)) {
    return raw
  }
  const secretRaw = process.env.DB_PASSWORD_SECRET ?? ''
  if (!secretRaw.trim()) {
    throw new Error(
      'DB_PASSWORD 为密文（enc1:）时缺少 DB_PASSWORD_SECRET。请把加密时用的密钥写在仓库根目录 .env（与 DB_PASSWORD 同级）；仅在 CMD 里 set 而另开窗口启动不会生效。',
    )
  }
  for (const secret of dbPasswordSecretTryValues(secretRaw)) {
    try {
      return decryptDbPassword(raw, secret)
    } catch {
      /* 尝试下一候选密钥 */
    }
  }
  throw new Error(
    'DB_PASSWORD 解密失败：请检查 DB_PASSWORD_SECRET 是否与加密时一致（注意 CMD 下 set VAR=\'x\' 会把引号算进变量），或密文是否完整含 enc1: 前缀',
  )
}
