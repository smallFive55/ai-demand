import {
  encryptDbPassword,
  normalizeDbPasswordSecret,
} from '../src/database/db-password-crypto'

const secret = normalizeDbPasswordSecret(process.env.DB_PASSWORD_SECRET ?? '')
if (!secret) {
  console.error(
    '请先设置环境变量 DB_PASSWORD_SECRET（与运行 API 时用于解密的密钥相同）',
  )
  process.exit(1)
}

const plain = process.argv[2]
if (plain === undefined || plain === '') {
  console.error(
    '用法: DB_PASSWORD_SECRET=你的密钥 pnpm encrypt-db-password <数据库明文密码>',
  )
  process.exit(1)
}

const cipher = encryptDbPassword(plain, secret)
console.log(cipher)
console.error(
  '提示：请把上一行整段粘贴到 .env 的 DB_PASSWORD= 后，须保留开头的 enc1:，不要只复制 Base64 段。',
)
