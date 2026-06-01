'use strict';

const addColumnIfMissing = async (queryInterface, tableName, columnName, definition) => {
  const table = await queryInterface.describeTable(tableName).catch(() => null);
  if (!table || table[columnName]) return;
  await queryInterface.addColumn(tableName, columnName, definition);
};

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  if (indexes.some((index) => index.name === options.name)) return;
  await queryInterface.addIndex(tableName, fields, options);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, 'pos_transactions', 'buyer_tin', {
      type: Sequelize.STRING(40),
      allowNull: true
    });
    await addColumnIfMissing(queryInterface, 'pos_transactions', 'buyer_business_style', {
      type: Sequelize.STRING(255),
      allowNull: true
    });
    await addColumnIfMissing(queryInterface, 'pos_transactions', 'buyer_address', {
      type: Sequelize.TEXT,
      allowNull: true
    });
    await addColumnIfMissing(queryInterface, 'pos_transactions', 'fiscal_document_template_version', {
      type: Sequelize.STRING(40),
      allowNull: true
    });
    await addColumnIfMissing(queryInterface, 'pos_transactions', 'fiscal_document_hash', {
      type: Sequelize.STRING(64),
      allowNull: true
    });
    await addColumnIfMissing(queryInterface, 'pos_transactions', 'fiscal_document_snapshot', {
      type: Sequelize.JSON,
      allowNull: true
    });
    await addColumnIfMissing(queryInterface, 'pos_transactions', 'void_reason', {
      type: Sequelize.STRING(255),
      allowNull: true
    });
    await addColumnIfMissing(queryInterface, 'pos_transactions', 'fiscal_lifecycle_state', {
      type: Sequelize.STRING(40),
      allowNull: false,
      defaultValue: 'original'
    });
    await addColumnIfMissing(queryInterface, 'pos_transactions', 'fiscal_reprint_count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
    await addColumnIfMissing(queryInterface, 'pos_transactions', 'fiscal_void_event_hash', {
      type: Sequelize.STRING(64),
      allowNull: true
    });

    await addIndexIfMissing(queryInterface, 'pos_transactions', ['buyer_tin'], {
      name: 'idx_pos_transactions_buyer_tin'
    });
    await addIndexIfMissing(queryInterface, 'pos_transactions', ['fiscal_document_hash'], {
      name: 'idx_pos_transactions_fiscal_document_hash'
    });
    await addIndexIfMissing(queryInterface, 'pos_transactions', ['fiscal_lifecycle_state'], {
      name: 'idx_pos_transactions_fiscal_lifecycle_state'
    });

    const terminalRegistrationTable = await queryInterface.describeTable('pos_fiscal_terminal_registrations').catch(() => null);
    if (!terminalRegistrationTable) {
      await queryInterface.createTable('pos_fiscal_terminal_registrations', {
        pos_fiscal_terminal_registration_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        terminal_id: { type: Sequelize.STRING(100), allowNull: false },
        location_id: { type: Sequelize.INTEGER, allowNull: true },
        min_number: { type: Sequelize.STRING(80), allowNull: true },
        machine_serial_number: { type: Sequelize.STRING(120), allowNull: true },
        software_version: { type: Sequelize.STRING(80), allowNull: true },
        software_serial_number: { type: Sequelize.STRING(120), allowNull: true },
        ptu_number: { type: Sequelize.STRING(80), allowNull: true },
        permit_issued_at: { type: Sequelize.DATEONLY, allowNull: true },
        permit_effective_at: { type: Sequelize.DATEONLY, allowNull: true },
        permit_expires_at: { type: Sequelize.DATEONLY, allowNull: true },
        receipt_printer_binding: { type: Sequelize.STRING(120), allowNull: true },
        cash_drawer_binding: { type: Sequelize.STRING(120), allowNull: true },
        accreditation_status: { type: Sequelize.ENUM('draft', 'pending_review', 'verified', 'revoked'), allowNull: false, defaultValue: 'draft' },
        evidence_ref: { type: Sequelize.STRING(255), allowNull: true },
        metadata: { type: Sequelize.JSON, allowNull: true },
        registered_by: { type: Sequelize.INTEGER, allowNull: true },
        verified_by: { type: Sequelize.INTEGER, allowNull: true },
        verified_at: { type: Sequelize.DATE, allowNull: true },
        revoked_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }
    await addIndexIfMissing(queryInterface, 'pos_fiscal_terminal_registrations', ['terminal_id'], {
      name: 'uq_pos_fiscal_terminal_registrations_terminal_id',
      unique: true
    });
    await addIndexIfMissing(queryInterface, 'pos_fiscal_terminal_registrations', ['location_id'], {
      name: 'idx_pos_fiscal_terminal_registrations_location'
    });
    await addIndexIfMissing(queryInterface, 'pos_fiscal_terminal_registrations', ['accreditation_status'], {
      name: 'idx_pos_fiscal_terminal_registrations_status'
    });

    const fiscalEventsTable = await queryInterface.describeTable('pos_fiscal_events').catch(() => null);
    if (!fiscalEventsTable) {
      await queryInterface.createTable('pos_fiscal_events', {
        pos_fiscal_event_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        pos_transaction_id: { type: Sequelize.INTEGER, allowNull: true },
        event_type: { type: Sequelize.ENUM('checkout_issued', 'print_original', 'print_reprint', 'void', 'reversal', 'x_reading', 'z_reading', 'esales_export', 'terminal_registration', 'governed_reset'), allowNull: false },
        document_type: { type: Sequelize.STRING(40), allowNull: true },
        invoice_number: { type: Sequelize.STRING(50), allowNull: true },
        terminal_id: { type: Sequelize.STRING(100), allowNull: true },
        event_sequence: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        event_hash: { type: Sequelize.STRING(64), allowNull: false },
        previous_event_hash: { type: Sequelize.STRING(64), allowNull: true },
        payload: { type: Sequelize.JSON, allowNull: false },
        actor_user_id: { type: Sequelize.INTEGER, allowNull: true },
        occurred_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }
    await addIndexIfMissing(queryInterface, 'pos_fiscal_events', ['event_hash'], {
      name: 'uq_pos_fiscal_events_event_hash',
      unique: true
    });
    await addIndexIfMissing(queryInterface, 'pos_fiscal_events', ['event_sequence'], {
      name: 'uq_pos_fiscal_events_sequence',
      unique: true
    });
    await addIndexIfMissing(queryInterface, 'pos_fiscal_events', ['pos_transaction_id'], {
      name: 'idx_pos_fiscal_events_transaction'
    });
    await addIndexIfMissing(queryInterface, 'pos_fiscal_events', ['event_type'], {
      name: 'idx_pos_fiscal_events_type'
    });

    const printEventsTable = await queryInterface.describeTable('pos_fiscal_print_events').catch(() => null);
    if (!printEventsTable) {
      await queryInterface.createTable('pos_fiscal_print_events', {
        pos_fiscal_print_event_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        pos_transaction_id: { type: Sequelize.INTEGER, allowNull: false },
        print_type: { type: Sequelize.ENUM('original', 'reprint'), allowNull: false },
        print_sequence: { type: Sequelize.INTEGER, allowNull: false },
        reason: { type: Sequelize.STRING(255), allowNull: true },
        fiscal_document_hash: { type: Sequelize.STRING(64), allowNull: true },
        actor_user_id: { type: Sequelize.INTEGER, allowNull: true },
        printed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }
    await addIndexIfMissing(queryInterface, 'pos_fiscal_print_events', ['pos_transaction_id'], {
      name: 'idx_pos_fiscal_print_events_transaction'
    });

    const esalesReportTable = await queryInterface.describeTable('pos_esales_reports').catch(() => null);
    if (!esalesReportTable) {
      await queryInterface.createTable('pos_esales_reports', {
        pos_esales_report_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        report_month: { type: Sequelize.STRING(7), allowNull: false },
        status: { type: Sequelize.ENUM('generated', 'submitted', 'accepted', 'rejected'), allowNull: false, defaultValue: 'generated' },
        payload: { type: Sequelize.JSON, allowNull: false },
        payload_hash: { type: Sequelize.STRING(64), allowNull: false },
        evidence_ref: { type: Sequelize.STRING(255), allowNull: true },
        generated_by: { type: Sequelize.INTEGER, allowNull: true },
        submitted_by: { type: Sequelize.INTEGER, allowNull: true },
        submitted_at: { type: Sequelize.DATE, allowNull: true },
        status_evidence_ref: { type: Sequelize.STRING(255), allowNull: true },
        status_note: { type: Sequelize.STRING(500), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }
    await addIndexIfMissing(queryInterface, 'pos_esales_reports', ['report_month'], {
      name: 'uq_pos_esales_reports_month',
      unique: true
    });
    await addIndexIfMissing(queryInterface, 'pos_esales_reports', ['status'], {
      name: 'idx_pos_esales_reports_status'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('pos_esales_reports', 'idx_pos_esales_reports_status').catch(() => null);
    await queryInterface.removeIndex('pos_esales_reports', 'uq_pos_esales_reports_month').catch(() => null);
    await queryInterface.dropTable('pos_esales_reports').catch(() => null);
    await queryInterface.removeIndex('pos_fiscal_print_events', 'idx_pos_fiscal_print_events_transaction').catch(() => null);
    await queryInterface.dropTable('pos_fiscal_print_events').catch(() => null);
    await queryInterface.removeIndex('pos_fiscal_events', 'idx_pos_fiscal_events_type').catch(() => null);
    await queryInterface.removeIndex('pos_fiscal_events', 'idx_pos_fiscal_events_transaction').catch(() => null);
    await queryInterface.removeIndex('pos_fiscal_events', 'uq_pos_fiscal_events_sequence').catch(() => null);
    await queryInterface.removeIndex('pos_fiscal_events', 'uq_pos_fiscal_events_event_hash').catch(() => null);
    await queryInterface.dropTable('pos_fiscal_events').catch(() => null);
    await queryInterface.removeIndex('pos_fiscal_terminal_registrations', 'idx_pos_fiscal_terminal_registrations_status').catch(() => null);
    await queryInterface.removeIndex('pos_fiscal_terminal_registrations', 'idx_pos_fiscal_terminal_registrations_location').catch(() => null);
    await queryInterface.removeIndex('pos_fiscal_terminal_registrations', 'uq_pos_fiscal_terminal_registrations_terminal_id').catch(() => null);
    await queryInterface.dropTable('pos_fiscal_terminal_registrations').catch(() => null);
    await queryInterface.removeIndex('pos_transactions', 'idx_pos_transactions_fiscal_lifecycle_state').catch(() => null);
    await queryInterface.removeIndex('pos_transactions', 'idx_pos_transactions_fiscal_document_hash').catch(() => null);
    await queryInterface.removeIndex('pos_transactions', 'idx_pos_transactions_buyer_tin').catch(() => null);
    await queryInterface.removeColumn('pos_transactions', 'fiscal_void_event_hash').catch(() => null);
    await queryInterface.removeColumn('pos_transactions', 'fiscal_reprint_count').catch(() => null);
    await queryInterface.removeColumn('pos_transactions', 'fiscal_lifecycle_state').catch(() => null);
    await queryInterface.removeColumn('pos_transactions', 'void_reason').catch(() => null);
    await queryInterface.removeColumn('pos_transactions', 'fiscal_document_snapshot').catch(() => null);
    await queryInterface.removeColumn('pos_transactions', 'fiscal_document_hash').catch(() => null);
    await queryInterface.removeColumn('pos_transactions', 'fiscal_document_template_version').catch(() => null);
    await queryInterface.removeColumn('pos_transactions', 'buyer_address').catch(() => null);
    await queryInterface.removeColumn('pos_transactions', 'buyer_business_style').catch(() => null);
    await queryInterface.removeColumn('pos_transactions', 'buyer_tin').catch(() => null);
  }
};
