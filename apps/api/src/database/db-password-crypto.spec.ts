import {
  decryptDbPassword,
  encryptDbPassword,
  ENCRYPTED_DB_PASSWORD_PREFIX,
  resolveDbPasswordFromEnv,
} from './db-password-crypto'

describe('db-password-crypto', () => {
  const secret = 'test-secret-at-least-ok'

  it('roundtrips', () => {
    const plain = 'my-db-p@ss!'
    const enc = encryptDbPassword(plain, secret)
    expect(enc.startsWith(ENCRYPTED_DB_PASSWORD_PREFIX)).toBe(true)
    expect(decryptDbPassword(enc, secret)).toBe(plain)
  })

  it('wrong secret fails', () => {
    const enc = encryptDbPassword('x', secret)
    expect(() => decryptDbPassword(enc, 'other-secret')).toThrow()
  })

  it('resolveDbPasswordFromEnv: plain passthrough', () => {
    const prev = process.env.DB_PASSWORD
    process.env.DB_PASSWORD = 'plain'
    delete process.env.DB_PASSWORD_SECRET
    expect(resolveDbPasswordFromEnv()).toBe('plain')
    process.env.DB_PASSWORD = prev
  })

  it('resolveDbPasswordFromEnv: decrypts enc1', () => {
    const prevP = process.env.DB_PASSWORD
    const prevS = process.env.DB_PASSWORD_SECRET
    const plain = 'secret-db'
    process.env.DB_PASSWORD_SECRET = secret
    process.env.DB_PASSWORD = encryptDbPassword(plain, secret)
    expect(resolveDbPasswordFromEnv()).toBe(plain)
    process.env.DB_PASSWORD = prevP
    process.env.DB_PASSWORD_SECRET = prevS
  })

  /**
   * CMD：`set VAR='值'` 会把单引号写进变量；dotenv 中 `VAR='值'` 常解析为不含引号的值。
   * 若加密在 CMD 下进行、运行 API 只读 .env，会出现「密钥看起来一样却解密失败」。
   */
  it('resolveDbPasswordFromEnv: CMD 带引号密钥加密、.env 无引号密钥仍可解密', () => {
    const prevP = process.env.DB_PASSWORD
    const prevS = process.env.DB_PASSWORD_SECRET
    const plain = 'j8NLb3eDHyYkpKAi'
    const cmdStyleSecret = "'你的长随机密钥'"
    const envFileStyleSecret = '你的长随机密钥'
    const enc = encryptDbPassword(plain, cmdStyleSecret)
    expect(() => decryptDbPassword(enc, envFileStyleSecret)).toThrow()
    process.env.DB_PASSWORD = enc
    process.env.DB_PASSWORD_SECRET = envFileStyleSecret
    expect(resolveDbPasswordFromEnv()).toBe(plain)
    process.env.DB_PASSWORD = prevP
    process.env.DB_PASSWORD_SECRET = prevS
  })

  it('resolveDbPasswordFromEnv: trims DB_PASSWORD line endings', () => {
    const prevP = process.env.DB_PASSWORD
    const prevS = process.env.DB_PASSWORD_SECRET
    const plain = 'x'
    process.env.DB_PASSWORD_SECRET = secret
    process.env.DB_PASSWORD = `${encryptDbPassword(plain, secret)}  `
    expect(resolveDbPasswordFromEnv()).toBe(plain)
    process.env.DB_PASSWORD = prevP
    process.env.DB_PASSWORD_SECRET = prevS
  })
})
