/**
 * TypeORM CLI 数据源（migration:run / revert），与运行时 `buildTypeOrmOptions()` 使用相同环境变量。
 * 在仓库根或 apps/api 下执行：`pnpm --filter @ai-demand/api migration:run`
 */
import { DataSource } from 'typeorm'
import '../load-env'
import { resolveDbPasswordFromEnv } from './db-password-crypto'
import { ALL_TYPEORM_ENTITIES } from './entities'
import { CreatePasswordResetTokens1744300800000 } from './migrations/1744300800000-CreatePasswordResetTokens'
import { SeedBusinessAdminRole1744300900000 } from './migrations/1744300900000-SeedBusinessAdminRole'
import { CreateRequirementIntakeTables1744291200000 } from './migrations/1744291200000-CreateRequirementIntakeTables'

export default new DataSource({
  type: 'mysql',
  connectorPackage: 'mysql2',
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: parseInt(process.env.DB_PORT ?? '3306', 10),
  username: process.env.DB_USER ?? process.env.DB_USERNAME ?? 'root',
  password: resolveDbPasswordFromEnv(),
  database: process.env.DB_NAME ?? process.env.DB_DATABASE ?? 'ai_demand',
  entities: [...ALL_TYPEORM_ENTITIES],
  migrations: [
    CreateRequirementIntakeTables1744291200000,
    CreatePasswordResetTokens1744300800000,
    SeedBusinessAdminRole1744300900000,
  ],
  migrationsTableName: 'typeorm_migrations',
})
