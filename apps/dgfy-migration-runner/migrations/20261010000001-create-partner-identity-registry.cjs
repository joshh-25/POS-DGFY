'use strict';

const normalizeTableName = (table) => (typeof table === 'string' ? table : table?.tableName || table?.TABLE_NAME || '');

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = (await queryInterface.showAllTables()).map(normalizeTableName);
    if (!tables.includes('partner_apps')) {
      await queryInterface.createTable('partner_apps', {
        id: { type: Sequelize.STRING(36), primaryKey: true, allowNull: false },
        app_slug: { type: Sequelize.STRING(96), allowNull: false },
        display_name: { type: Sequelize.STRING(191), allowNull: false },
        status: { type: Sequelize.ENUM('pending', 'approved', 'suspended', 'retired'), allowNull: false, defaultValue: 'pending' },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await queryInterface.addIndex('partner_apps', ['app_slug'], { unique: true, name: 'uq_partner_apps_slug' });
      await queryInterface.addIndex('partner_apps', ['status'], { name: 'idx_partner_apps_status' });
    }
    if (!tables.includes('oidc_clients')) {
      await queryInterface.createTable('oidc_clients', {
        id: { type: Sequelize.STRING(36), primaryKey: true, allowNull: false },
        app_id: { type: Sequelize.STRING(36), allowNull: false },
        client_id: { type: Sequelize.STRING(191), allowNull: false },
        client_type: { type: Sequelize.ENUM('browser', 'machine', 'service'), allowNull: false },
        environment: { type: Sequelize.STRING(64), allowNull: false },
        status: { type: Sequelize.ENUM('pending', 'active', 'suspended', 'revoked'), allowNull: false, defaultValue: 'pending' },
        auth_method: { type: Sequelize.ENUM('client_secret_basic', 'private_key_jwt'), allowNull: false },
        secret_hash: { type: Sequelize.STRING(255), allowNull: true },
        public_key_pem: { type: Sequelize.TEXT, allowNull: true },
        key_id: { type: Sequelize.STRING(128), allowNull: true },
        audience: { type: Sequelize.STRING(255), allowNull: false },
        redirect_uris: { type: Sequelize.JSON, allowNull: false },
        post_logout_redirect_uris: { type: Sequelize.JSON, allowNull: false },
        allowed_scopes: { type: Sequelize.JSON, allowNull: false },
        context_adapter: { type: Sequelize.STRING(96), allowNull: true },
        secret_rotated_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await queryInterface.addIndex('oidc_clients', ['client_id'], { unique: true, name: 'uq_oidc_clients_client_id' });
      await queryInterface.addIndex('oidc_clients', ['app_id', 'status'], { name: 'idx_oidc_clients_app_status' });
    }
  },

  async down(queryInterface) {
    const tables = (await queryInterface.showAllTables()).map(normalizeTableName);
    if (tables.includes('oidc_clients')) await queryInterface.dropTable('oidc_clients');
    if (tables.includes('partner_apps')) await queryInterface.dropTable('partner_apps');
  }
};
