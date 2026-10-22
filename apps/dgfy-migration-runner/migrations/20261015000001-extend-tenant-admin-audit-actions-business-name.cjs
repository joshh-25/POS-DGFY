'use strict';

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return tables.some((entry) => {
    const name = typeof entry === 'string' ? entry : entry?.tableName || entry?.table_name;
    return name === tableName;
  });
};

const ACTIONS = "'capability_update', 'pos_metadata_update', 'admin_create_tenant', 'admin_create_account_and_tenant', 'admin_assign_owner', 'admin_force_assign_owner', 'affiliate_slots_update', 'force_delete_registration_history', 'registration_upload_download', 'business_name_update'";
const PREVIOUS_ACTIONS = "'capability_update', 'pos_metadata_update', 'admin_create_tenant', 'admin_create_account_and_tenant', 'admin_assign_owner', 'admin_force_assign_owner', 'affiliate_slots_update', 'force_delete_registration_history', 'registration_upload_download'";

module.exports = {
  async up(queryInterface) {
    if (!await tableExists(queryInterface, 'tenant_admin_audit_logs')) return;
    await queryInterface.sequelize.query(
      `ALTER TABLE tenant_admin_audit_logs MODIFY action ENUM(${ACTIONS}) NOT NULL;`
    );
  },

  async down(queryInterface) {
    if (!await tableExists(queryInterface, 'tenant_admin_audit_logs')) return;
    await queryInterface.sequelize.query(
      "UPDATE tenant_admin_audit_logs SET action = 'capability_update' WHERE action = 'business_name_update';"
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE tenant_admin_audit_logs MODIFY action ENUM(${PREVIOUS_ACTIONS}) NOT NULL;`
    );
  }
};
