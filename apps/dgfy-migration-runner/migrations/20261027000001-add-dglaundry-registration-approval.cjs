const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return (tables || []).some((entry) => String(entry?.tableName || entry?.table_name || entry).toLowerCase() === tableName.toLowerCase());
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!await tableExists(queryInterface, 'dgfy_dglaundry_intents')) return;

    const columns = await queryInterface.describeTable('dgfy_dglaundry_intents');
    const addColumnIfMissing = async (name, definition) => {
      if (!columns[name]) await queryInterface.addColumn('dgfy_dglaundry_intents', name, definition);
    };

    await queryInterface.changeColumn('dgfy_dglaundry_intents', 'status', {
      type: Sequelize.ENUM('pending', 'approved', 'rejected', 'correction_required', 'expired', 'consumed'),
      allowNull: false,
      defaultValue: 'pending'
    });
    await queryInterface.changeColumn('dgfy_dglaundry_intents', 'expires_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.sequelize.query(
      "UPDATE dgfy_dglaundry_intents SET expires_at = NULL WHERE intent_type = 'registration' AND status IN ('pending', 'correction_required')"
    );
    await addColumnIfMissing('applicant_issuer', { type: Sequelize.STRING(255), allowNull: true });
    await addColumnIfMissing('applicant_subject', { type: Sequelize.STRING(255), allowNull: true });
    await addColumnIfMissing('status_version', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 });
    await addColumnIfMissing('company_access_version', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
    await addColumnIfMissing('decision', { type: Sequelize.ENUM('approve', 'reject', 'request_correction'), allowNull: true });
    await addColumnIfMissing('decision_expected_version', { type: Sequelize.INTEGER, allowNull: true });
    await addColumnIfMissing('decision_reason', { type: Sequelize.TEXT, allowNull: true });
    await addColumnIfMissing('decided_by', { type: Sequelize.STRING(120), allowNull: true });
    await addColumnIfMissing('decided_at', { type: Sequelize.DATE, allowNull: true });

    if (!await tableExists(queryInterface, 'dgfy_dglaundry_provider_locations')) {
      await queryInterface.createTable('dgfy_dglaundry_provider_locations', {
        id: { type: Sequelize.UUID, primaryKey: true },
        company_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'tenants', key: 'id' },
          onDelete: 'CASCADE'
        },
        registration_intent_id: {
          type: Sequelize.UUID,
          allowNull: false,
          unique: true
        },
        name: { type: Sequelize.STRING(255), allowNull: false },
        status: { type: Sequelize.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await queryInterface.addConstraint('dgfy_dglaundry_provider_locations', {
        fields: ['registration_intent_id'],
        type: 'foreign key',
        name: 'fk_dglaundry_provider_location_intent',
        references: { table: 'dgfy_dglaundry_intents', field: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      });
      await queryInterface.addIndex('dgfy_dglaundry_provider_locations', ['company_id', 'status'], {
        name: 'idx_dglaundry_provider_location_company_status'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    if (await tableExists(queryInterface, 'dgfy_dglaundry_provider_locations')) {
      await queryInterface.dropTable('dgfy_dglaundry_provider_locations');
    }
    if (!await tableExists(queryInterface, 'dgfy_dglaundry_intents')) return;

    const columns = await queryInterface.describeTable('dgfy_dglaundry_intents');
    for (const name of ['decided_at', 'decided_by', 'decision_reason', 'decision_expected_version', 'decision', 'company_access_version', 'status_version', 'applicant_subject', 'applicant_issuer']) {
      if (columns[name]) await queryInterface.removeColumn('dgfy_dglaundry_intents', name);
    }
    // The prior ENUM does not include correction_required. Reopen those intents
    // before narrowing it so MySQL can restore the original status definition.
    await queryInterface.sequelize.query(
      "UPDATE dgfy_dglaundry_intents SET status = 'pending' WHERE status = 'correction_required'"
    );
    await queryInterface.sequelize.query(
      "UPDATE dgfy_dglaundry_intents SET expires_at = DATE_ADD(NOW(), INTERVAL 15 MINUTE) WHERE expires_at IS NULL"
    );
    await queryInterface.changeColumn('dgfy_dglaundry_intents', 'expires_at', {
      type: Sequelize.DATE,
      allowNull: false
    });
    await queryInterface.changeColumn('dgfy_dglaundry_intents', 'status', {
      type: Sequelize.ENUM('pending', 'approved', 'rejected', 'expired', 'consumed'),
      allowNull: false,
      defaultValue: 'pending'
    });
  }
};
