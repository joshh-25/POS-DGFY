'use strict';

// Landlord only: TenantIntakeProposal is excluded from tenant model cloning.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tenantColumns = await queryInterface.describeTable('tenants');
    if (!tenantColumns.is_demo) {
      await queryInterface.addColumn('tenants', 'is_demo', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    }
    const tables = await queryInterface.showAllTables();
    if (!tables.some((table) => (typeof table === 'string' ? table : table.tableName) === 'tenant_intake_proposals')) {
      await queryInterface.createTable('tenant_intake_proposals', {
        id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
        target: { type: Sequelize.ENUM('OFFICIAL', 'DEMO'), allowNull: false },
        status: { type: Sequelize.ENUM('pending', 'approved', 'executing', 'executed', 'rejected', 'expired', 'failed'), allowNull: false, defaultValue: 'pending' },
        source: { type: Sequelize.ENUM('mcp', 'admin_upload', 'admin_form'), allowNull: false },
        requested_by_admin_id: { type: Sequelize.UUID, allowNull: false },
        payload_json: { type: Sequelize.JSON, allowNull: false },
        payload_hash: { type: Sequelize.STRING(64), allowNull: false },
        provenance: { type: Sequelize.JSON, allowNull: true },
        warnings: { type: Sequelize.JSON, allowNull: false },
        expires_at: { type: Sequelize.DATE, allowNull: false },
        approved_by_admin_id: { type: Sequelize.UUID, allowNull: true },
        approved_at: { type: Sequelize.DATE, allowNull: true },
        approved_via: { type: Sequelize.STRING(40), allowNull: true },
        tenant_id: { type: Sequelize.UUID, allowNull: true },
        failure_detail: { type: Sequelize.JSON, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }
    const indexes = await queryInterface.showIndex('tenant_intake_proposals');
    if (!indexes.some((index) => index.name === 'idx_tenant_intake_status_time')) {
      await queryInterface.addIndex('tenant_intake_proposals', ['status', 'created_at'], { name: 'idx_tenant_intake_status_time' });
    }
  },
  async down() {
    // Retain proposals, audit evidence and the demo classification; rollback code only.
    throw new Error('Tenant intake rollback requires an operator-reviewed data preservation plan; no automatic schema drop.');
  }
};
