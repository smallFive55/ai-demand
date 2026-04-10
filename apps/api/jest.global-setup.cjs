/**
 * Jest 在独立进程运行 globalSetup；用 tsx 执行 TS 以复用 enc1: 密码解密与 load-env。
 */
const path = require('node:path')
const { spawnSync } = require('node:child_process')

module.exports = async function globalSetup() {
  if (process.env.DISABLE_TEST_DB_RESET === 'true') {
    return
  }

  const apiRoot = __dirname
  const script = path.join(apiRoot, 'src', 'test', 'truncate-test-database-cli.ts')
  const r = spawnSync(process.execPath, ['--import', 'tsx', script], {
    cwd: apiRoot,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test' },
    shell: false,
  })
  if (r.status !== 0) {
    throw new Error(`truncate-test-database exited with code ${r.status ?? r.signal}`)
  }
}
