import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * 已有库在首次种子后不会重跑 seedDefaults，补插 business 角色供账号管理关联。
 */
export class SeedBusinessAdminRole1744300900000 implements MigrationInterface {
  name = 'SeedBusinessAdminRole1744300900000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT id FROM \`admin_roles\` WHERE \`name\` = 'business' LIMIT 1`,
    )) as { id: string }[]
    if (rows.length > 0) {
      return
    }

    await queryRunner.query(
      `
      INSERT INTO \`admin_roles\` (\`id\`, \`name\`, \`description\`, \`status\`, \`permissions\`, \`created_at\`, \`updated_at\`)
      VALUES (
        UUID(),
        'business',
        '业务方：可发起对话式需求；无系统管理后台权限（需求接口仅校验登录角色名）',
        'enabled',
        CAST('[]' AS JSON),
        UTC_TIMESTAMP(3),
        UTC_TIMESTAMP(3)
      )
    `,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM \`admin_roles\` WHERE \`name\` = 'business'`)
  }
}
