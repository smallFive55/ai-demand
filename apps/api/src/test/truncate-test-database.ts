/**
 * 清空集成测试库中的业务表（保留 typeorm_migrations）。
 * 由 jest.global-setup.cjs 在跑测前调用，避免共享远程 ai_demand_test 脏数据。
 */
import { createConnection } from 'mysql2/promise'
import '../load-env'
import { resolveTestDbPasswordFromEnv } from '../database/db-password-crypto'

const TABLES = [
  'audit_events',
  'requirement_field_snapshots',
  'requirement_messages',
  'requirements',
  'business_units',
  'admin_accounts',
  'admin_roles',
  'admin_auth_users',
] as const

export async function truncateTestDatabase(): Promise<void> {
  const host = process.env.TEST_DB_HOST ?? process.env.DB_HOST ?? '127.0.0.1'
  const port = parseInt(
    process.env.TEST_DB_PORT ?? process.env.DB_PORT ?? '3306',
    10,
  )
  const user =
    process.env.TEST_DB_USER ??
    process.env.DB_USER ??
    process.env.DB_USERNAME ??
    'root'
  const password = resolveTestDbPasswordFromEnv()
  const database = process.env.TEST_DB_NAME ?? 'ai_demand_test'

  const conn = await createConnection({
    host,
    port,
    user,
    password,
    database,
    multipleStatements: false,
  })

  try {
    await conn.query('SET FOREIGN_KEY_CHECKS=0')
    for (const table of TABLES) {
      await conn.query(`TRUNCATE TABLE \`${table}\``)
    }
    await conn.query('SET FOREIGN_KEY_CHECKS=1')
  } finally {
    await conn.end()
  }
}
