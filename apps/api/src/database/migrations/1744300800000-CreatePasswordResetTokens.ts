import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CreatePasswordResetTokens1744300800000 implements MigrationInterface {
  name = 'CreatePasswordResetTokens1744300800000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`password_reset_tokens\` (
        \`id\` varchar(36) NOT NULL,
        \`user_id\` varchar(64) NOT NULL,
        \`token_hash\` varchar(64) NOT NULL,
        \`expires_at\` datetime(3) NOT NULL,
        \`used_at\` datetime(3) NULL,
        \`created_at\` datetime(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_password_reset_tokens_token_hash\` (\`token_hash\`),
        KEY \`IDX_password_reset_tokens_user_id\` (\`user_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`password_reset_tokens\``)
  }
}
