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
      "ALTER TABLE tenant_admin_audit_logs MODIFY action ENUM('capability_update', 'pos_metadata_update') NOT NULL;"
    );
  },

  async down(queryInterface) {
    if (!await tableExists(queryInterface, 'tenant_admin_audit_logs')) return;
    await queryInterface.sequelize.query(
      "UPDATE tenant_admin_audit_logs SET action = 'capability_update' WHERE action = 'pos_metadata_update';"
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE tenant_admin_audit_logs MODIFY action ENUM('capability_update') NOT NULL;"
    );
  }
};
