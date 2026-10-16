'use strict';

const normalizeTableName = (table) => (typeof table === 'string' ? table : table?.tableName || table?.TABLE_NAME || '');

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = (await queryInterface.showAllTables()).map(normalizeTableName);
    if (!tables.includes('partner_client_credentials')) {
      await queryInterface.createTable('partner_client_credentials', {
        id: { type: Sequelize.STRING(36), primaryKey: true, allowNull: false },
        client_id: { type: Sequelize.STRING(191), allowNull: false },
        version: { type: Sequelize.INTEGER, allowNull: false },
        kind: { type: Sequelize.ENUM('secret_hash', 'public_key'), allowNull: false },
        secret_hash: { type: Sequelize.STRING(255), allowNull: true },
        public_key_pem: { type: Sequelize.TEXT, allowNull: true },
        key_id: { type: Sequelize.STRING(128), allowNull: true },
        status: { type: Sequelize.ENUM('active', 'overlap', 'retired', 'revoked'), allowNull: false },
        activated_at: { type: Sequelize.DATE, allowNull: true },
        overlap_expires_at: { type: Sequelize.DATE, allowNull: true },
        revoked_at: { type: Sequelize.DATE, allowNull: true },
        created_by_admin_id: { type: Sequelize.STRING(36), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await queryInterface.addIndex('partner_client_credentials', ['client_id', 'version'], { unique: true, name: 'uq_partner_client_credentials_version' });
      await queryInterface.addIndex('partner_client_credentials', ['client_id', 'status', 'overlap_expires_at'], { name: 'idx_partner_client_credentials_valid' });
      await queryInterface.addIndex('partner_client_credentials', ['key_id'], { name: 'idx_partner_client_credentials_kid' });
    }

    if (!tables.includes('partner_attachments')) {
      await queryInterface.createTable('partner_attachments', {
        id: { type: Sequelize.STRING(36), primaryKey: true, allowNull: false },
        app_id: { type: Sequelize.STRING(36), allowNull: false },
        client_id: { type: Sequelize.STRING(191), allowNull: false },
        tenant_id: { type: Sequelize.STRING(36), allowNull: false },
        location_ids: { type: Sequelize.JSON, allowNull: false },
        scopes: { type: Sequelize.JSON, allowNull: false },
        location_authority: { type: Sequelize.JSON, allowNull: false },
        entitlements: { type: Sequelize.JSON, allowNull: false },
        status: { type: Sequelize.ENUM('active', 'suspended', 'disconnected', 'revoked'), allowNull: false },
        consented_by_user_id: { type: Sequelize.STRING(36), allowNull: true },
        consented_at: { type: Sequelize.DATE, allowNull: true },
        disconnected_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await queryInterface.addIndex('partner_attachments', ['client_id', 'tenant_id', 'status'], { name: 'idx_partner_attachments_client_tenant_status' });
      await queryInterface.addIndex('partner_attachments', ['app_id', 'status'], { name: 'idx_partner_attachments_app_status' });
      await queryInterface.addIndex('partner_attachments', ['tenant_id', 'status'], { name: 'idx_partner_attachments_tenant_status' });
      // A generated nullable key enforces one active attachment while permitting
      // historical disconnected/revoked rows for the same client and tenant.
      await queryInterface.sequelize.query("ALTER TABLE partner_attachments ADD COLUMN active_pair_key CHAR(64) GENERATED ALWAYS AS (CASE WHEN status = 'active' THEN SHA2(CONCAT(client_id, ':', tenant_id), 256) ELSE NULL END) STORED");
      await queryInterface.addIndex('partner_attachments', ['active_pair_key'], { unique: true, name: 'uq_partner_attachments_active_pair' });
    }
  },

  async down(queryInterface) {
    const tables = (await queryInterface.showAllTables()).map(normalizeTableName);
    if (tables.includes('partner_attachments')) await queryInterface.dropTable('partner_attachments');
    if (tables.includes('partner_client_credentials')) await queryInterface.dropTable('partner_client_credentials');
  }
};
