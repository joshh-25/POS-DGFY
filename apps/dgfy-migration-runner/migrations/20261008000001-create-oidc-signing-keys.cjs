'use strict';

const TABLE_NAME = 'oidc_signing_keys';
const normalizeTableName = (table) => (typeof table === 'string' ? table : table?.tableName || table?.TABLE_NAME || '');

// This is a landlord/platform registry. The migration runner's connection is the landlord DB;
// this table is deliberately not cloned into tenant schemas. It has no deploy-order dependency
// on the open entries in docs/ops/TENANT_SCHEMA_SYNC_RESIDUAL_RISK_TRACKER.md.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if ((tables || []).map(normalizeTableName).includes(TABLE_NAME)) return;
    await queryInterface.createTable(TABLE_NAME, {
      id: { type: Sequelize.STRING(36), primaryKey: true, allowNull: false },
      kid: { type: Sequelize.STRING(128), allowNull: false },
      status: { type: Sequelize.ENUM('active', 'retiring', 'revoked'), allowNull: false, defaultValue: 'retiring' },
      public_key_pem: { type: Sequelize.TEXT, allowNull: false },
      private_key_env_ref: { type: Sequelize.STRING(191), allowNull: false },
      activated_at: { type: Sequelize.DATE, allowNull: true },
      retired_at: { type: Sequelize.DATE, allowNull: true },
      revoked_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });
    await queryInterface.addIndex(TABLE_NAME, ['kid'], { unique: true, name: 'uq_oidc_signing_keys_kid' });
    await queryInterface.addIndex(TABLE_NAME, ['status', 'activated_at'], { name: 'idx_oidc_signing_keys_status' });
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    if ((tables || []).map(normalizeTableName).includes(TABLE_NAME)) await queryInterface.dropTable(TABLE_NAME);
  }
};
