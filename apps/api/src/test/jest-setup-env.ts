/**
 * 在任何 *.spec.ts import 集成模块之前加载 .env（含 monorepo 根目录），
 * 否则 `DB_HOST` 等未定义，测试库会回退到 127.0.0.1。
 */
import '../load-env'
