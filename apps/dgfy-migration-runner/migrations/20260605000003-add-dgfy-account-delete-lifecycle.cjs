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
  if (!await tableExists(queryInterface, tableName)) return false;
  const table = await queryInterface.describeTable(tableName);
  return Boolean(table[columnName]);
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
    if (!await hasColumn(queryInterface, 'dgfy_accounts', 'deleted_at')) {
      await queryInterface.addColumn('dgfy_accounts', 'deleted_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }
    if (!await hasColumn(queryInterface, 'dgfy_accounts', 'deleted_by')) {
      await queryInterface.addColumn('dgfy_accounts', 'deleted_by', {
        type: Sequelize.STRING(120),
        allowNull: true
      });
    }
    if (!await hasColumn(queryInterface, 'dgfy_accounts', 'deletion_reason')) {
      await queryInterface.addColumn('dgfy_accounts', 'deletion_reason', {
        type: Sequelize.STRING(500),
        allowNull: true
      });
    }

    await addIndexIfMissing(queryInterface, 'dgfy_accounts', ['deleted_at'], {
      name: 'idx_dgfy_accounts_deleted_at'
    });

    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'enum_dgfy_account_admin_audit_logs_action'
              AND e.enumlabel = 'delete'
          ) THEN
            ALTER TYPE enum_dgfy_account_admin_audit_logs_action ADD VALUE 'delete';
          END IF;
        END $$;
      `);
    } else if (await tableExists(queryInterface, 'dgfy_account_admin_audit_logs')) {
      await queryInterface.changeColumn('dgfy_account_admin_audit_logs', 'action', {
        type: Sequelize.ENUM('profile_update', 'suspend', 'reactivate', 'delete'),
        allowNull: false
      });
    }
  },

  async down(queryInterface, Sequelize) {
    if (await tableExists(queryInterface, 'dgfy_account_admin_audit_logs')) {
      await queryInterface.changeColumn('dgfy_account_admin_audit_logs', 'action', {
        type: Sequelize.ENUM('profile_update', 'suspend', 'reactivate'),
        allowNull: false
      }).catch(() => {});
    }

    await removeIndexIfExists(queryInterface, 'dgfy_accounts', 'idx_dgfy_accounts_deleted_at');
    if (await hasColumn(queryInterface, 'dgfy_accounts', 'deletion_reason')) {
      await queryInterface.removeColumn('dgfy_accounts', 'deletion_reason');
    }
    if (await hasColumn(queryInterface, 'dgfy_accounts', 'deleted_by')) {
      await queryInterface.removeColumn('dgfy_accounts', 'deleted_by');
    }
    if (await hasColumn(queryInterface, 'dgfy_accounts', 'deleted_at')) {
      await queryInterface.removeColumn('dgfy_accounts', 'deleted_at');
    }
  }
};
