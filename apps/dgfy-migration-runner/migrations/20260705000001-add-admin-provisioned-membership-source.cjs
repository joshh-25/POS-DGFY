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
    if (!await tableExists(queryInterface, 'dgfy_account_tenant_memberships')) return;

    await queryInterface.sequelize.query(
      "ALTER TABLE dgfy_account_tenant_memberships MODIFY source ENUM('founder', 'invite', 'admin_handover', 'admin_provisioned') NOT NULL DEFAULT 'invite';"
    );
  },

  async down(queryInterface) {
    if (!await tableExists(queryInterface, 'dgfy_account_tenant_memberships')) return;

    await queryInterface.sequelize.query(
      "UPDATE dgfy_account_tenant_memberships SET source = 'invite' WHERE source = 'admin_provisioned';"
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE dgfy_account_tenant_memberships MODIFY source ENUM('founder', 'invite', 'admin_handover') NOT NULL DEFAULT 'invite';"
    );
  }
};
