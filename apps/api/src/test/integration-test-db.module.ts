import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ALL_TYPEORM_ENTITIES } from '../database/entities'

const entities = [...ALL_TYPEORM_ENTITIES]

/**
 * 集成测试用 MySQL（与生产相同引擎，避免 Windows 下编译 better-sqlite3）。
 *
 * 环境变量（均有默认值，可按需覆盖）：
 * - TEST_DB_HOST（默认 127.0.0.1）
 * - TEST_DB_PORT（默认 3306）
 * - TEST_DB_USER（默认 root）
 * - TEST_DB_PASSWORD（默认空）
 * - TEST_DB_NAME（默认 ai_demand_test）
 *
 * 请先创建空库：`CREATE DATABASE ai_demand_test ...`，首次跑测时 `synchronize: true` 会建表。
 */
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      connectorPackage: 'mysql2',
      host: process.env.TEST_DB_HOST ?? '127.0.0.1',
      port: parseInt(process.env.TEST_DB_PORT ?? '3306', 10),
      username: process.env.TEST_DB_USER ?? 'root',
      password: process.env.TEST_DB_PASSWORD ?? '',
      database: process.env.TEST_DB_NAME ?? 'ai_demand_test',
      entities,
      synchronize: true,
      logging: false,
      extra: { charset: 'utf8mb4_unicode_ci' },
    }),
    TypeOrmModule.forFeature(entities),
  ],
  exports: [TypeOrmModule],
})
export class IntegrationTestDbModule {}
