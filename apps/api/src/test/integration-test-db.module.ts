import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { buildMysqlOptionsForJestIntegration } from '../database/typeorm-options'
import { ALL_TYPEORM_ENTITIES } from '../database/entities'

const entities = [...ALL_TYPEORM_ENTITIES]

/**
 * 集成测试用 MySQL（与生产相同引擎，避免 Windows 下编译 better-sqlite3）。
 *
 * 连接与 `buildMysqlOptionsForJestIntegration()` 一致：
 * - `TEST_DB_*` 优先；未设置时回退 `DB_HOST` / `DB_PORT` / `DB_USER`（或 `DB_USERNAME`）/ `DB_PASSWORD`（含 enc1:）
 * - 库名默认 `TEST_DB_NAME` 或 `ai_demand_test`（与开发库 `DB_DATABASE` 分离）
 *
 * 请先在目标实例上建库：`CREATE DATABASE ai_demand_test ...`，首次跑测时 `synchronize: true` 会建表。
 */
@Module({
  imports: [
    TypeOrmModule.forRoot({
      ...buildMysqlOptionsForJestIntegration(),
    }),
    TypeOrmModule.forFeature(entities),
  ],
  exports: [TypeOrmModule],
})
export class IntegrationTestDbModule {}
