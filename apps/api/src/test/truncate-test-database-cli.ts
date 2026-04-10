import '../load-env'
import { truncateTestDatabase } from './truncate-test-database'

async function run(): Promise<void> {
  if (process.env.DISABLE_TEST_DB_RESET === 'true') {
    console.log('[truncate-test-database] DISABLE_TEST_DB_RESET=true, skip')
    return
  }
  console.log(
    '[truncate-test-database] truncating tables in',
    process.env.TEST_DB_NAME ?? 'ai_demand_test',
  )
  await truncateTestDatabase()
}

void run().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
