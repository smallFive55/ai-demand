import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'

/**
 * 在任意 cwd 下启动 Nest 时仍能加载 monorepo 根目录的 .env。
 * 须作为 main 的第一个 import；Jest 须在 setupFiles 中 import 本文件（jest 不会跑 main.ts）。
 *
 * 本文件位于 apps/api/src 或 dist：向上两级为仓库根，向上一级为 apps/api。
 */
const loaded = new Set<string>()

function loadFile(absPath: string): void {
  const p = resolve(absPath)
  if (!existsSync(p) || loaded.has(p)) return
  loaded.add(p)
  loadEnv({ path: p, override: true })
}

loadFile(join(__dirname, '..', '..', '.env'))
loadFile(join(__dirname, '..', '.env'))

const cwd = process.cwd()
loadFile(join(cwd, '.env'))
loadFile(join(cwd, '..', '.env'))
loadFile(join(cwd, '..', '..', '.env'))
loadFile(join(cwd, '..', '..', '..', '.env'))
