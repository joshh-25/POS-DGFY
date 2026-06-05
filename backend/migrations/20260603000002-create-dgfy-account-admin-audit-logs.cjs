const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return (tables || []).some((entry) => {
    const value = typeof entry === 'string'
      ? entry
      : (entry?.tableName || entry?.table_name || String(entry));
    return String(value).toLowerCase() === String(tableName).toLowerCase();
  });
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

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!await tableExists(queryInterface, 'dgfy_account_admin_audit_logs')) {
      await queryInterface.createTable('dgfy_account_admin_audit_logs', {
        audit_log_id: {
          type: Sequelize.BIGINT,
          autoIncrement: true,
          primaryKey: true
        },
        dgfy_account_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'dgfy_accounts', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        action: {
          type: Sequelize.ENUM('profile_update', 'suspend', 'reactivate'),
          allowNull: false
        },
        actor_username: {
          type: Sequelize.STRING(120),
          allowNull: false
        },
        reason: {
          type: Sequelize.STRING(500),
          allowNull: true
        },
        request_id: {
          type: Sequelize.STRING(100),
          allowNull: true
        },
        ip_address: {
          type: Sequelize.STRING(64),
          allowNull: true
        },
        user_agent: {
          type: Sequelize.STRING(500),
          allowNull: true
        },
        before_snapshot: {
          type: Sequelize.JSON,
          allowNull: true
        },
        after_snapshot: {
          type: Sequelize.JSON,
          allowNull: true
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
    }

    await addIndexIfMissing(queryInterface, 'dgfy_account_admin_audit_logs', ['dgfy_account_id', 'created_at'], {
      name: 'idx_dgfy_account_admin_audit_account_time'
    });
    await addIndexIfMissing(queryInterface, 'dgfy_account_admin_audit_logs', ['action'], {
      name: 'idx_dgfy_account_admin_audit_action'
    });
    await addIndexIfMissing(queryInterface, 'dgfy_account_admin_audit_logs', ['actor_username'], {
      name: 'idx_dgfy_account_admin_audit_actor'
    });
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'dgfy_account_admin_audit_logs')) {
      await removeIndexIfExists(queryInterface, 'dgfy_account_admin_audit_logs', 'idx_dgfy_account_admin_audit_account_time');
      await removeIndexIfExists(queryInterface, 'dgfy_account_admin_audit_logs', 'idx_dgfy_account_admin_audit_action');
      await removeIndexIfExists(queryInterface, 'dgfy_account_admin_audit_logs', 'idx_dgfy_account_admin_audit_actor');
      await queryInterface.dropTable('dgfy_account_admin_audit_logs');
    }
    if (queryInterface.sequelize.getDialect() === 'mysql') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_dgfy_account_admin_audit_logs_action').catch(() => {});
    }
  }
};
