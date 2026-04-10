import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Story 2.1：接待阶段 requirements / 消息 / 字段快照三表。
 * 使用 IF NOT EXISTS，便于已在 dev 开启 DB_SYNCHRONIZE 的环境补跑迁移记录。
 */
export class CreateRequirementIntakeTables1744291200000 implements MigrationInterface {
  name = 'CreateRequirementIntakeTables1744291200000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`requirements\` (
        \`id\` varchar(36) NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`status\` varchar(48) NOT NULL DEFAULT 'collecting',
        \`submitter_id\` varchar(64) NOT NULL,
        \`created_at\` datetime(3) NOT NULL,
        \`updated_at\` datetime(3) NOT NULL,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`requirement_messages\` (
        \`id\` varchar(36) NOT NULL,
        \`requirement_id\` varchar(36) NOT NULL,
        \`role\` varchar(16) NOT NULL,
        \`content\` text NOT NULL,
        \`created_at\` datetime(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`IDX_requirement_messages_requirement_id\` (\`requirement_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`requirement_field_snapshots\` (
        \`id\` varchar(36) NOT NULL,
        \`requirement_id\` varchar(36) NOT NULL,
        \`version\` int NOT NULL,
        \`collected_fields\` json NOT NULL,
        \`created_at\` datetime(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_requirement_field_snapshots_req_version\` (\`requirement_id\`, \`version\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`requirement_field_snapshots\``)
    await queryRunner.query(`DROP TABLE IF EXISTS \`requirement_messages\``)
    await queryRunner.query(`DROP TABLE IF EXISTS \`requirements\``)
  }
}
