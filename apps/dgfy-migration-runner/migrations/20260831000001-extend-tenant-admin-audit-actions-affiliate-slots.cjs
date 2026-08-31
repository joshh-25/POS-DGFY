'use strict';

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return tables.some((entry) => {
    const name = typeof entry === 'string' ? entry : entry?.tableName || entry?.table_name;
    return name === tableName;
  });
};

module.exports = {
  async up(queryInterface) {
    if (!await tableExists(queryInterface, 'tenant_admin_audit_logs')) return;
    await queryInterface.sequelize.query(
      "ALTER TABLE tenant_admin_audit_logs MODIFY action ENUM('capability_update', 'pos_metadata_update', 'admin_create_tenant', 'admin_create_account_and_tenant', 'admin_assign_owner', 'admin_force_assign_owner', 'affiliate_slots_update') NOT NULL;"
    );
  },

  async down(queryInterface) {
    if (!await tableExists(queryInterface, 'tenant_admin_audit_logs')) return;
    // Lossy by construction: an `affiliate_slots_update` row becomes `capability_update` before
    // the ENUM shrinks, matching the existing precedent's own down() behavior (see
    // 20260615000001-extend-tenant-admin-audit-actions.cjs, 20260625000001-add-platform-admin-
    // assisted-provisioning.cjs). Reversing this migration is a rollback scenario, not a routine
    // one -- see the compliance declaration's rollback_note.
    await queryInterface.sequelize.query(
      "UPDATE tenant_admin_audit_logs SET action = 'capability_update' WHERE action = 'affiliate_slots_update';"
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE tenant_admin_audit_logs MODIFY action ENUM('capability_update', 'pos_metadata_update', 'admin_create_tenant', 'admin_create_account_and_tenant', 'admin_assign_owner', 'admin_force_assign_owner') NOT NULL;"
    );
  }
};
