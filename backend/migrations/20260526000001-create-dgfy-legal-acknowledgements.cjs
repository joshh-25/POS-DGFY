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
    if (!await tableExists(queryInterface, 'dgfy_legal_acknowledgements')) {
      await queryInterface.createTable('dgfy_legal_acknowledgements', {
        acknowledgement_id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true
        },
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
        flow: {
          type: Sequelize.ENUM('dgfy_account_registration', 'dgfy_company_registration'),
          allowNull: false
        },
        terms_version: {
          type: Sequelize.STRING(80),
          allowNull: true
        },
        privacy_version: {
          type: Sequelize.STRING(80),
          allowNull: true
        },
        company_terms_version: {
          type: Sequelize.STRING(80),
          allowNull: true
        },
        marketplace_terms_version: {
          type: Sequelize.STRING(80),
          allowNull: false
        },
        acknowledgement_text: {
          type: Sequelize.TEXT,
          allowNull: false
        },
        acknowledgement_hash: {
          type: Sequelize.STRING(64),
          allowNull: false
        },
        ip_address: {
          type: Sequelize.STRING(64),
          allowNull: true
        },
        user_agent: {
          type: Sequelize.STRING(500),
          allowNull: true
        },
        request_id: {
          type: Sequelize.STRING(100),
          allowNull: true
        },
        accepted_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        }
      });
    }

    await addIndexIfMissing(queryInterface, 'dgfy_legal_acknowledgements', ['dgfy_account_id', 'flow', 'accepted_at'], {
      name: 'idx_dgfy_legal_ack_account_flow_time'
    });
    await addIndexIfMissing(queryInterface, 'dgfy_legal_acknowledgements', ['tenant_id', 'flow'], {
      name: 'idx_dgfy_legal_ack_tenant_flow'
    });
    await addIndexIfMissing(queryInterface, 'dgfy_legal_acknowledgements', ['marketplace_terms_version'], {
      name: 'idx_dgfy_legal_ack_marketplace_version'
    });
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'dgfy_legal_acknowledgements')) {
      await removeIndexIfExists(queryInterface, 'dgfy_legal_acknowledgements', 'idx_dgfy_legal_ack_account_flow_time');
      await removeIndexIfExists(queryInterface, 'dgfy_legal_acknowledgements', 'idx_dgfy_legal_ack_tenant_flow');
      await removeIndexIfExists(queryInterface, 'dgfy_legal_acknowledgements', 'idx_dgfy_legal_ack_marketplace_version');
      await queryInterface.dropTable('dgfy_legal_acknowledgements');
    }
    if (queryInterface.sequelize.getDialect() === 'mysql') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_dgfy_legal_acknowledgements_flow').catch(() => {});
    }
  }
};
