-- ai-demand 管理域表结构（MySQL 8+）
-- 执行前请创建数据库用户并授权；将库名按需修改。

CREATE DATABASE IF NOT EXISTS `ai_demand`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Jest / 集成测试默认库（也可由 TypeORM synchronize 自动建表，但需先存在空库）
CREATE DATABASE IF NOT EXISTS `ai_demand_test`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `ai_demand`;

-- 登录后台用户（用户名密码，与组织账号 admin_accounts 分离）
CREATE TABLE IF NOT EXISTS `admin_auth_users` (
  `id` VARCHAR(64) NOT NULL,
  `username` VARCHAR(128) NOT NULL,
  `display_name` VARCHAR(128) NOT NULL,
  `role_name` VARCHAR(64) NOT NULL DEFAULT 'admin',
  `status` ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled',
  `password_hash` VARCHAR(255) NOT NULL,
  `password_salt` VARCHAR(64) NOT NULL,
  `created_at` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_admin_auth_users_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- RBAC 角色
CREATE TABLE IF NOT EXISTS `admin_roles` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(64) NOT NULL,
  `description` VARCHAR(512) NOT NULL DEFAULT '',
  `status` ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled',
  `permissions` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_admin_roles_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 组织成员账号（关联角色 UUID）
CREATE TABLE IF NOT EXISTS `admin_accounts` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `role_id` CHAR(36) NOT NULL,
  `status` ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled',
  `created_at` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_admin_accounts_email` (`email`),
  KEY `idx_admin_accounts_role_id` (`role_id`),
  CONSTRAINT `fk_admin_accounts_role`
    FOREIGN KEY (`role_id`) REFERENCES `admin_roles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 审计事件
CREATE TABLE IF NOT EXISTS `audit_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `action` VARCHAR(32) NOT NULL,
  `actor` VARCHAR(128) NOT NULL,
  `target` VARCHAR(512) NOT NULL,
  `request_id` VARCHAR(64) NOT NULL,
  `occurred_at` DATETIME(3) NOT NULL,
  `before_data` JSON NULL,
  `after_data` JSON NULL,
  `success` TINYINT(1) NOT NULL,
  `reason_code` VARCHAR(64) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_audit_events_request_id` (`request_id`),
  KEY `idx_audit_events_occurred_at` (`occurred_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 业务板块
CREATE TABLE IF NOT EXISTS `business_units` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT NOT NULL,
  `function_list` JSON NOT NULL,
  `delivery_manager_id` CHAR(36) NOT NULL,
  `admission_criteria` TEXT NOT NULL,
  `admission_threshold` INT NOT NULL,
  `status` ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled',
  `created_at` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_business_units_name` (`name`),
  KEY `idx_business_units_delivery_manager_id` (`delivery_manager_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
