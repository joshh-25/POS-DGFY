'use strict';

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return tables.some((entry) => {
    const name = typeof entry === 'string' ? entry : entry?.tableName || entry?.table_name;
    return name === tableName;
  });
};

const describeTable = async (queryInterface, tableName) => {
  if (!await tableExists(queryInterface, tableName)) return null;
  return queryInterface.describeTable(tableName);
};

const addColumnIfMissing = async (queryInterface, tableName, columnName, definition) => {
  const table = await describeTable(queryInterface, tableName);
  if (!table || table[columnName]) return;
  await queryInterface.addColumn(tableName, columnName, definition);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, 'dgfy_accounts', 'provisioning_status', {
      type: Sequelize.ENUM('self_registered', 'admin_provisioned'),
      allowNull: false,
      defaultValue: 'self_registered'
    });
    await addColumnIfMissing(queryInterface, 'dgfy_accounts', 'temporary_password_active', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    await addColumnIfMissing(queryInterface, 'dgfy_accounts', 'email_verification_source', {
      type: Sequelize.ENUM('public_otp', 'platform_admin_provisioned'),
      allowNull: true
    });
    await addColumnIfMissing(queryInterface, 'dgfy_accounts', 'merchant_terms_acknowledged_at', {
      type: Sequelize.DATE,
      allowNull: true
    });

    await addColumnIfMissing(queryInterface, 'tenants', 'provisioning_source', {
      type: Sequelize.ENUM('public_registration', 'platform_admin'),
      allowNull: false,
      defaultValue: 'public_registration'
    });
    await addColumnIfMissing(queryInterface, 'tenants', 'ownership_status', {
      type: Sequelize.ENUM('claimed', 'unassigned', 'handover_pending'),
      allowNull: false,
      defaultValue: 'claimed'
    });

    if (await tableExists(queryInterface, 'dgfy_account_tenant_memberships')) {
      await queryInterface.sequelize.query(
        "ALTER TABLE dgfy_account_tenant_memberships MODIFY source ENUM('founder', 'invite', 'admin_handover') NOT NULL DEFAULT 'invite';"
      );
    }
    if (await tableExists(queryInterface, 'dgfy_account_admin_audit_logs')) {
      await queryInterface.sequelize.query(
        "ALTER TABLE dgfy_account_admin_audit_logs MODIFY action ENUM('profile_update', 'suspend', 'reactivate', 'delete', 'admin_create_dgfy_account', 'temporary_password_rotated') NOT NULL;"
      );
    }
    if (await tableExists(queryInterface, 'tenant_admin_audit_logs')) {
      await queryInterface.sequelize.query(
        "ALTER TABLE tenant_admin_audit_logs MODIFY action ENUM('capability_update', 'pos_metadata_update', 'admin_create_tenant', 'admin_create_account_and_tenant', 'admin_assign_owner', 'admin_force_assign_owner') NOT NULL;"
      );
    }
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'tenant_admin_audit_logs')) {
      await queryInterface.sequelize.query(
        "UPDATE tenant_admin_audit_logs SET action = 'capability_update' WHERE action IN ('admin_create_tenant', 'admin_create_account_and_tenant', 'admin_assign_owner', 'admin_force_assign_owner');"
      );
      await queryInterface.sequelize.query(
        "ALTER TABLE tenant_admin_audit_logs MODIFY action ENUM('capability_update', 'pos_metadata_update') NOT NULL;"
      );
    }
    if (await tableExists(queryInterface, 'dgfy_account_admin_audit_logs')) {
      await queryInterface.sequelize.query(
        "UPDATE dgfy_account_admin_audit_logs SET action = 'profile_update' WHERE action IN ('admin_create_dgfy_account', 'temporary_password_rotated');"
      );
      await queryInterface.sequelize.query(
        "ALTER TABLE dgfy_account_admin_audit_logs MODIFY action ENUM('profile_update', 'suspend', 'reactivate', 'delete') NOT NULL;"
      );
    }
    if (await tableExists(queryInterface, 'dgfy_account_tenant_memberships')) {
      await queryInterface.sequelize.query(
        "UPDATE dgfy_account_tenant_memberships SET source = 'invite' WHERE source = 'admin_handover';"
      );
      await queryInterface.sequelize.query(
        "ALTER TABLE dgfy_account_tenant_memberships MODIFY source ENUM('founder', 'invite') NOT NULL DEFAULT 'invite';"
      );
    }

    const tenantTable = await describeTable(queryInterface, 'tenants');
    if (tenantTable?.ownership_status) await queryInterface.removeColumn('tenants', 'ownership_status');
    if (tenantTable?.provisioning_source) await queryInterface.removeColumn('tenants', 'provisioning_source');

    const accountTable = await describeTable(queryInterface, 'dgfy_accounts');
    if (accountTable?.merchant_terms_acknowledged_at) await queryInterface.removeColumn('dgfy_accounts', 'merchant_terms_acknowledged_at');
    if (accountTable?.email_verification_source) await queryInterface.removeColumn('dgfy_accounts', 'email_verification_source');
    if (accountTable?.temporary_password_active) await queryInterface.removeColumn('dgfy_accounts', 'temporary_password_active');
    if (accountTable?.provisioning_status) await queryInterface.removeColumn('dgfy_accounts', 'provisioning_status');
  }
};
