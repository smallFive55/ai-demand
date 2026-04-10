import { truncateTestDatabase } from './truncate-test-database'

/**
 * 每个集成 spec 文件开头清库一次，避免文件之间执行顺序导致脏读（audit / 账号等）。
 */
export function resetTestDatabaseBeforeFile(): void {
  beforeAll(async () => {
    if (process.env.DISABLE_TEST_DB_RESET === 'true') {
      return
    }
    await truncateTestDatabase()
  })
}
