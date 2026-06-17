const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return (tables || []).some((entry) => {
    const value = typeof entry === 'string'
      ? entry
      : (entry?.tableName || entry?.table_name || String(entry));
    return String(value).toLowerCase() === String(tableName).toLowerCase();
  });
};

const hasColumn = async (queryInterface, tableName, columnName) => {
  try {
    const description = await queryInterface.describeTable(tableName);
    return Object.prototype.hasOwnProperty.call(description, columnName);
  } catch {
    return false;
  }
};

const hasIndex = async (queryInterface, tableName, indexName) => {
  try {
    const indexes = await queryInterface.showIndex(tableName);
    return (indexes || []).some((index) => String(index.name).toLowerCase() === String(indexName).toLowerCase());
  } catch {
    return false;
  }
};

const addIndexIfMissing = async (queryInterface, tableName, columns, options = {}) => {
  if (options.name && await hasIndex(queryInterface, tableName, options.name)) return;
  await queryInterface.addIndex(tableName, columns, options);
};

const removeIndexIfExists = async (queryInterface, tableName, indexName) => {
  if (await hasIndex(queryInterface, tableName, indexName)) {
    await queryInterface.removeIndex(tableName, indexName);
  }
};

const addColumnIfMissing = async (queryInterface, tableName, columnName, definition) => {
  if (!await hasColumn(queryInterface, tableName, columnName)) {
    await queryInterface.addColumn(tableName, columnName, definition);
  }
};

const removeColumnIfExists = async (queryInterface, tableName, columnName) => {
  if (await hasColumn(queryInterface, tableName, columnName)) {
    await queryInterface.removeColumn(tableName, columnName);
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (await tableExists(queryInterface, 'dgfy_accounts')) {
      await addColumnIfMissing(queryInterface, 'dgfy_accounts', 'business_step_up_verified_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    if (await tableExists(queryInterface, 'dgfy_account_tenant_memberships')) {
      await addColumnIfMissing(queryInterface, 'dgfy_account_tenant_memberships', 'last_selected_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
      await addIndexIfMissing(queryInterface, 'dgfy_account_tenant_memberships', ['dgfy_account_id', 'last_selected_at'], {
        name: 'idx_dgfy_memberships_account_last_selected'
      });
    }

    if (await tableExists(queryInterface, 'email_otps')) {
      await queryInterface.changeColumn('email_otps', 'purpose', {
        type: Sequelize.ENUM(
          'company_registration',
          'tenant_user_registration',
          'invitation_acceptance',
          'email_change',
          'dgfy_account_verification',
          'dgfy_password_reset',
          'dgfy_business_step_up'
        ),
        allowNull: false
      });
    }

    if (!await tableExists(queryInterface, 'dgfy_account_business_audit_logs')) {
      await queryInterface.createTable('dgfy_account_business_audit_logs', {
        audit_log_id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
        dgfy_account_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'dgfy_accounts', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        tenant_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'tenants', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        membership_id: { type: Sequelize.INTEGER, allowNull: true },
        action: {
          type: Sequelize.ENUM('company_switch_success', 'company_switch_failed', 'invitation_accept_success', 'invitation_accept_failed'),
          allowNull: false
        },
        result: {
          type: Sequelize.ENUM('success', 'failure'),
          allowNull: false
        },
        reason: { type: Sequelize.STRING(500), allowNull: true },
        request_id: { type: Sequelize.STRING(100), allowNull: true },
        ip_address: { type: Sequelize.STRING(64), allowNull: true },
        user_agent: { type: Sequelize.STRING(500), allowNull: true },
        metadata: { type: Sequelize.JSON, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }

    await addIndexIfMissing(queryInterface, 'dgfy_account_business_audit_logs', ['dgfy_account_id', 'created_at'], {
      name: 'idx_dgfy_business_audit_account_time'
    });
    await addIndexIfMissing(queryInterface, 'dgfy_account_business_audit_logs', ['tenant_id', 'created_at'], {
      name: 'idx_dgfy_business_audit_tenant_time'
    });
    await addIndexIfMissing(queryInterface, 'dgfy_account_business_audit_logs', ['action'], {
      name: 'idx_dgfy_business_audit_action'
    });
  },

  async down(queryInterface, Sequelize) {
    if (await tableExists(queryInterface, 'dgfy_account_business_audit_logs')) {
      await removeIndexIfExists(queryInterface, 'dgfy_account_business_audit_logs', 'idx_dgfy_business_audit_account_time');
      await removeIndexIfExists(queryInterface, 'dgfy_account_business_audit_logs', 'idx_dgfy_business_audit_tenant_time');
      await removeIndexIfExists(queryInterface, 'dgfy_account_business_audit_logs', 'idx_dgfy_business_audit_action');
      await queryInterface.dropTable('dgfy_account_business_audit_logs');
    }

    if (await tableExists(queryInterface, 'dgfy_account_tenant_memberships')) {
      await removeIndexIfExists(queryInterface, 'dgfy_account_tenant_memberships', 'idx_dgfy_memberships_account_last_selected');
      await removeColumnIfExists(queryInterface, 'dgfy_account_tenant_memberships', 'last_selected_at');
    }

    if (await tableExists(queryInterface, 'dgfy_accounts')) {
      await removeColumnIfExists(queryInterface, 'dgfy_accounts', 'business_step_up_verified_at');
    }

    if (await tableExists(queryInterface, 'email_otps')) {
      await queryInterface.changeColumn('email_otps', 'purpose', {
        type: Sequelize.ENUM(
          'company_registration',
          'tenant_user_registration',
          'invitation_acceptance',
          'email_change',
          'dgfy_account_verification',
          'dgfy_password_reset'
        ),
        allowNull: false
      });
    }
  }
};
