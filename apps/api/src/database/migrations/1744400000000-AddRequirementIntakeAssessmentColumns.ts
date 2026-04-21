import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Story 2.2：项目识别与准入（板块、项目 ID、匹配度、交付经理追溯）。
 */
export class AddRequirementIntakeAssessmentColumns1744400000000 implements MigrationInterface {
  name = 'AddRequirementIntakeAssessmentColumns1744400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`requirements\`
        ADD COLUMN \`business_unit_id\` varchar(36) NULL AFTER \`submitter_id\`,
        ADD COLUMN \`project_ids\` json NULL AFTER \`business_unit_id\`,
        ADD COLUMN \`admission_score\` int NULL AFTER \`project_ids\`,
        ADD COLUMN \`admission_rationale\` text NULL AFTER \`admission_score\`,
        ADD COLUMN \`delivery_manager_id\` varchar(64) NULL AFTER \`admission_rationale\`
    `)
    await queryRunner.query(`UPDATE \`requirements\` SET \`project_ids\` = CAST('[]' AS JSON) WHERE \`project_ids\` IS NULL`)
    await queryRunner.query(`ALTER TABLE \`requirements\` MODIFY \`project_ids\` json NOT NULL`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`requirements\`
        DROP COLUMN \`delivery_manager_id\`,
        DROP COLUMN \`admission_rationale\`,
        DROP COLUMN \`admission_score\`,
        DROP COLUMN \`project_ids\`,
        DROP COLUMN \`business_unit_id\`
    `)
  }
}
