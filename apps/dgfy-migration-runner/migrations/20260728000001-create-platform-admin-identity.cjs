'use strict';

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  if (!indexes.some((index) => index.name === options.name)) await queryInterface.addIndex(tableName, fields, options);
};

const timestamps = (Sequelize) => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
});

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!await queryInterface.describeTable('platform_admin_users').catch(() => null)) {
      await queryInterface.createTable('platform_admin_users', {
        id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
        username: { type: Sequelize.STRING(120), allowNull: false },
        username_normalized: { type: Sequelize.STRING(120), allowNull: false },
        password_hash: { type: Sequelize.STRING(255), allowNull: false },
        is_master: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        auth_source: { type: Sequelize.ENUM('bootstrap_env', 'database'), allowNull: false },
        status: { type: Sequelize.ENUM('active', 'suspended', 'deleted'), allowNull: false, defaultValue: 'active' },
        temporary_password_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        password_changed_at: { type: Sequelize.DATE, allowNull: true }, auth_version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        created_by_admin_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'platform_admin_users', key: 'id' }, onDelete: 'RESTRICT' }, suspended_at: { type: Sequelize.DATE, allowNull: true }, suspended_by_admin_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'platform_admin_users', key: 'id' }, onDelete: 'RESTRICT' }, suspension_reason: { type: Sequelize.STRING(500), allowNull: true },
        deleted_at: { type: Sequelize.DATE, allowNull: true }, deleted_by_admin_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'platform_admin_users', key: 'id' }, onDelete: 'RESTRICT' }, deletion_reason: { type: Sequelize.STRING(500), allowNull: true }, ...timestamps(Sequelize)
      });
    }
    await addIndexIfMissing(queryInterface, 'platform_admin_users', ['username_normalized'], { name: 'unique_platform_admin_username_normalized', unique: true });
    if (!await queryInterface.describeTable('platform_admin_permissions').catch(() => null)) {
      await queryInterface.createTable('platform_admin_permissions', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true }, admin_user_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'platform_admin_users', key: 'id' }, onDelete: 'RESTRICT' }, permission_key: { type: Sequelize.STRING(80), allowNull: false }, ...timestamps(Sequelize)
      });
    }
    await addIndexIfMissing(queryInterface, 'platform_admin_permissions', ['admin_user_id', 'permission_key'], { name: 'unique_platform_admin_permission', unique: true });
    if (!await queryInterface.describeTable('platform_admin_sessions').catch(() => null)) {
      await queryInterface.createTable('platform_admin_sessions', {
        id: { type: Sequelize.UUID, primaryKey: true, allowNull: false }, admin_user_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'platform_admin_users', key: 'id' }, onDelete: 'RESTRICT' }, auth_version: { type: Sequelize.INTEGER, allowNull: false }, issued_at: { type: Sequelize.DATE, allowNull: false }, expires_at: { type: Sequelize.DATE, allowNull: false }, revoked_at: { type: Sequelize.DATE, allowNull: true }, revoked_reason: { type: Sequelize.STRING(160), allowNull: true }, ip_hash: { type: Sequelize.STRING(128), allowNull: true }, user_agent_hash: { type: Sequelize.STRING(128), allowNull: true }, ...timestamps(Sequelize)
      });
    }
    await addIndexIfMissing(queryInterface, 'platform_admin_sessions', ['admin_user_id', 'revoked_at'], { name: 'idx_platform_admin_sessions_active' });
    if (!await queryInterface.describeTable('platform_admin_audit_logs').catch(() => null)) {
      await queryInterface.createTable('platform_admin_audit_logs', {
        id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true }, actor_admin_id: { type: Sequelize.UUID, allowNull: true }, actor_username_snapshot: { type: Sequelize.STRING(120), allowNull: true }, target_admin_id: { type: Sequelize.UUID, allowNull: true }, target_username_snapshot: { type: Sequelize.STRING(120), allowNull: true }, action: { type: Sequelize.STRING(100), allowNull: false }, reason: { type: Sequelize.STRING(500), allowNull: true }, before_snapshot: { type: Sequelize.JSON, allowNull: true }, after_snapshot: { type: Sequelize.JSON, allowNull: true }, request_metadata: { type: Sequelize.JSON, allowNull: true }, created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.dropTable('platform_admin_audit_logs').catch(() => {});
    await queryInterface.dropTable('platform_admin_sessions').catch(() => {});
    await queryInterface.dropTable('platform_admin_permissions').catch(() => {});
    await queryInterface.dropTable('platform_admin_users').catch(() => {});
  }
};
