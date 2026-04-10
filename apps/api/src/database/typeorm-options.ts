import type { TypeOrmModuleOptions } from '@nestjs/typeorm'
import { resolveDbPasswordFromEnv } from './db-password-crypto'
import { ALL_TYPEORM_ENTITIES } from './entities'

export function buildTypeOrmOptions(): TypeOrmModuleOptions {
  const isJestOrTest = process.env.NODE_ENV === 'test'

  if (isJestOrTest) {
    return {
      type: 'mysql',
      connectorPackage: 'mysql2',
      host: process.env.TEST_DB_HOST ?? '127.0.0.1',
      port: parseInt(process.env.TEST_DB_PORT ?? '3306', 10),
      username: process.env.TEST_DB_USER ?? 'root',
      password: process.env.TEST_DB_PASSWORD ?? '',
      database: process.env.TEST_DB_NAME ?? 'ai_demand_test',
      entities: [...ALL_TYPEORM_ENTITIES],
      synchronize: true,
      logging: false,
      extra: { charset: 'utf8mb4_unicode_ci' },
    }
  }

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
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
    extra: {
      charset: 'utf8mb4_unicode_ci',
    },
  }
}
