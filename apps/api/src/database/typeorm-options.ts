import type { TypeOrmModuleOptions } from '@nestjs/typeorm'
import { resolveDbPasswordFromEnv, resolveTestDbPasswordFromEnv } from './db-password-crypto'
import { ALL_TYPEORM_ENTITIES } from './entities'
import { CreatePasswordResetTokens1744300800000 } from './migrations/1744300800000-CreatePasswordResetTokens'
import { SeedBusinessAdminRole1744300900000 } from './migrations/1744300900000-SeedBusinessAdminRole'
import { CreateRequirementIntakeTables1744291200000 } from './migrations/1744291200000-CreateRequirementIntakeTables'

/** Jest 集成测试与 `NODE_ENV=test` 运行时共用：主机默认同 `DB_HOST`，便于远程测试库仅配一套连接 */
export function buildMysqlOptionsForJestIntegration(): TypeOrmModuleOptions {
  return {
    type: 'mysql',
    connectorPackage: 'mysql2',
    host: process.env.TEST_DB_HOST ?? process.env.DB_HOST ?? '127.0.0.1',
    port: parseInt(
      process.env.TEST_DB_PORT ?? process.env.DB_PORT ?? '3306',
      10,
    ),
    username:
      process.env.TEST_DB_USER ??
      process.env.DB_USER ??
      process.env.DB_USERNAME ??
      'root',
    password: resolveTestDbPasswordFromEnv(),
    database: process.env.TEST_DB_NAME ?? 'ai_demand_test',
    entities: [...ALL_TYPEORM_ENTITIES],
    synchronize: true,
    logging: false,
    extra: { charset: 'utf8mb4_unicode_ci' },
  }
}

export function buildTypeOrmOptions(): TypeOrmModuleOptions {
  const isJestOrTest = process.env.NODE_ENV === 'test'

  if (isJestOrTest) {
    return buildMysqlOptionsForJestIntegration()
  }

  const autoMigrate = process.env.DB_MIGRATIONS_RUN !== 'false'

  return {
    type: 'mysql',
    connectorPackage: 'mysql2',
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: parseInt(process.env.DB_PORT ?? '3306', 10),
    username:
      process.env.DB_USER ?? process.env.DB_USERNAME ?? 'root',
    password: resolveDbPasswordFromEnv(),
    database:
      process.env.DB_NAME ?? process.env.DB_DATABASE ?? 'ai_demand',
    entities: [...ALL_TYPEORM_ENTITIES],
    migrations: [
      CreateRequirementIntakeTables1744291200000,
      CreatePasswordResetTokens1744300800000,
      SeedBusinessAdminRole1744300900000,
    ],
    migrationsTableName: 'typeorm_migrations',
    /** 默认启动时补跑未执行迁移，避免仅打开 DB_SYNCHRONIZE 的旧库缺少 requirements 等表导致业务方 500 */
    migrationsRun: autoMigrate,
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
    extra: {
      charset: 'utf8mb4_unicode_ci',
    },
  }
}
