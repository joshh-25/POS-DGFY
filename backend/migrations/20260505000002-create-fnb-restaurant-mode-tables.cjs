'use strict';

const normalizeTableName = (table) => {
  if (!table) return '';
  if (typeof table === 'string') return table;
  return table.tableName || table.TABLE_NAME || '';
};

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return (tables || []).map(normalizeTableName).includes(tableName);
};

const columnExists = async (queryInterface, tableName, columnName) => {
  if (!(await tableExists(queryInterface, tableName))) return false;
  const table = await queryInterface.describeTable(tableName);
  return Boolean(table?.[columnName]);
};

const addColumnSafe = async (queryInterface, tableName, columnName, definition) => {
  if (await columnExists(queryInterface, tableName, columnName)) return;
  await queryInterface.addColumn(tableName, columnName, definition);
};

const addIndexSafe = async (queryInterface, tableName, fields, options = {}) => {
  if (!(await tableExists(queryInterface, tableName))) return;
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  if (options.name && (indexes || []).some((index) => index.name === options.name)) return;
  await queryInterface.addIndex(tableName, fields, options);
};

const createTableSafe = async (queryInterface, tableName, definition) => {
  if (await tableExists(queryInterface, tableName)) return;
  await queryInterface.createTable(tableName, definition);
};

const timestamps = (Sequelize) => ({
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

module.exports = {
  async up(queryInterface, Sequelize) {
    await createTableSafe(queryInterface, 'fnb_modifier_groups', {
      modifier_group_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING(120), allowNull: false },
      display_name: { type: Sequelize.STRING(120), allowNull: true },
      min_select: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      max_select: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      required: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'fnb_modifier_options', {
      modifier_option_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      modifier_group_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'fnb_modifier_groups', key: 'modifier_group_id' }, onDelete: 'CASCADE' },
      name: { type: Sequelize.STRING(120), allowNull: false },
      price_delta: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      sku_item_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'items', key: 'item_id' }, onDelete: 'SET NULL' },
      is_default: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      allergen_notes: { type: Sequelize.JSON, allowNull: true },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'fnb_item_modifier_groups', {
      item_modifier_group_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      item_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'items', key: 'item_id' }, onDelete: 'CASCADE' },
      modifier_group_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'fnb_modifier_groups', key: 'modifier_group_id' }, onDelete: 'CASCADE' },
      is_required_override: { type: Sequelize.BOOLEAN, allowNull: true },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'fnb_dining_areas', {
      dining_area_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING(120), allowNull: false },
      service_type: { type: Sequelize.ENUM('dine_in', 'outdoor', 'bar', 'private_room'), allowNull: false, defaultValue: 'dine_in' },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'fnb_dining_tables', {
      table_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      dining_area_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'fnb_dining_areas', key: 'dining_area_id' }, onDelete: 'CASCADE' },
      table_number: { type: Sequelize.STRING(40), allowNull: false },
      label: { type: Sequelize.STRING(120), allowNull: true },
      seat_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 2 },
      status: { type: Sequelize.ENUM('available', 'seated', 'held', 'out_of_service'), allowNull: false, defaultValue: 'available' },
      qr_slug: { type: Sequelize.STRING(120), allowNull: true },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'fnb_kitchen_stations', {
      kitchen_station_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING(120), allowNull: false },
      station_type: { type: Sequelize.ENUM('hot_line', 'cold_line', 'bar', 'dessert', 'expo', 'prep', 'other'), allowNull: false, defaultValue: 'hot_line' },
      ticket_prefix: { type: Sequelize.STRING(20), allowNull: true },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'fnb_item_kitchen_routes', {
      item_kitchen_route_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      item_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'items', key: 'item_id' }, onDelete: 'CASCADE' },
      kitchen_station_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'fnb_kitchen_stations', key: 'kitchen_station_id' }, onDelete: 'CASCADE' },
      default_course: { type: Sequelize.ENUM('appetizer', 'main', 'dessert', 'drink', 'other'), allowNull: false, defaultValue: 'main' },
      is_primary: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'fnb_checks', {
      check_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      table_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'fnb_dining_tables', key: 'table_id' }, onDelete: 'SET NULL' },
      dining_area_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'fnb_dining_areas', key: 'dining_area_id' }, onDelete: 'SET NULL' },
      server_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'user_id' }, onDelete: 'SET NULL' },
      guest_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      order_method: { type: Sequelize.ENUM('dine_in', 'takeout', 'pickup', 'delivery'), allowNull: false, defaultValue: 'dine_in' },
      status: { type: Sequelize.ENUM('open', 'sent_to_kitchen', 'partially_paid', 'paid', 'voided', 'transferred'), allowNull: false, defaultValue: 'open' },
      opened_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      closed_at: { type: Sequelize.DATE, allowNull: true },
      pos_transaction_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'pos_transactions', key: 'pos_transaction_id' }, onDelete: 'SET NULL' },
      notes: { type: Sequelize.TEXT, allowNull: true },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'fnb_check_lines', {
      check_line_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      check_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'fnb_checks', key: 'check_id' }, onDelete: 'CASCADE' },
      item_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'items', key: 'item_id' }, onDelete: 'RESTRICT' },
      quantity: { type: Sequelize.DECIMAL(24, 12), allowNull: false },
      course: { type: Sequelize.ENUM('appetizer', 'main', 'dessert', 'drink', 'other'), allowNull: false, defaultValue: 'main' },
      modifiers_snapshot: { type: Sequelize.JSON, allowNull: true },
      special_instructions: { type: Sequelize.TEXT, allowNull: true },
      kitchen_station_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'fnb_kitchen_stations', key: 'kitchen_station_id' }, onDelete: 'SET NULL' },
      status: { type: Sequelize.ENUM('pending', 'sent', 'preparing', 'ready', 'served', 'voided'), allowNull: false, defaultValue: 'pending' },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'fnb_kitchen_tickets', {
      kitchen_ticket_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      check_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'fnb_checks', key: 'check_id' }, onDelete: 'CASCADE' },
      kitchen_station_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'fnb_kitchen_stations', key: 'kitchen_station_id' }, onDelete: 'SET NULL' },
      ticket_number: { type: Sequelize.STRING(50), allowNull: false },
      status: { type: Sequelize.ENUM('queued', 'preparing', 'ready', 'served', 'cancelled'), allowNull: false, defaultValue: 'queued' },
      lines_snapshot: { type: Sequelize.JSON, allowNull: true },
      fired_at: { type: Sequelize.DATE, allowNull: true },
      ready_at: { type: Sequelize.DATE, allowNull: true },
      served_at: { type: Sequelize.DATE, allowNull: true },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'fnb_reservation_requests', {
      reservation_request_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      public_reference: { type: Sequelize.STRING(40), allowNull: false, unique: true },
      customer_name: { type: Sequelize.STRING(255), allowNull: false },
      customer_email: { type: Sequelize.STRING(255), allowNull: true },
      customer_phone: { type: Sequelize.STRING(50), allowNull: true },
      party_size: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 2 },
      requested_at: { type: Sequelize.DATE, allowNull: false },
      duration_minutes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 90 },
      buffer_minutes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 15 },
      table_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'fnb_dining_tables', key: 'table_id' }, onDelete: 'SET NULL' },
      status: { type: Sequelize.ENUM('requested', 'confirmed', 'waitlisted', 'seated', 'cancelled', 'no_show'), allowNull: false, defaultValue: 'requested' },
      source: { type: Sequelize.ENUM('storefront', 'pos', 'admin'), allowNull: false, defaultValue: 'admin' },
      notes: { type: Sequelize.TEXT, allowNull: true },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'fnb_reservation_tables', {
      reservation_table_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      reservation_request_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'fnb_reservation_requests', key: 'reservation_request_id' }, onDelete: 'CASCADE' },
      table_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'fnb_dining_tables', key: 'table_id' }, onDelete: 'CASCADE' },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'fnb_restaurant_service_charge_snapshots', {
      service_charge_snapshot_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      pos_transaction_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'pos_transactions', key: 'pos_transaction_id' }, onDelete: 'CASCADE' },
      check_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'fnb_checks', key: 'check_id' }, onDelete: 'SET NULL' },
      label_snapshot: { type: Sequelize.STRING(120), allowNull: false, defaultValue: 'Restaurant service charge' },
      amount: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      rate_snapshot: { type: Sequelize.DECIMAL(7, 4), allowNull: true },
      taxable: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      settings_snapshot: { type: Sequelize.JSON, allowNull: true },
      ...timestamps(Sequelize)
    });

    await addColumnSafe(queryInterface, 'pos_transactions', 'fnb_check_id', { type: Sequelize.INTEGER, allowNull: true });
    await addColumnSafe(queryInterface, 'pos_transactions', 'fnb_table_id', { type: Sequelize.INTEGER, allowNull: true });
    await addColumnSafe(queryInterface, 'pos_transactions', 'fnb_table_label_snapshot', { type: Sequelize.STRING(120), allowNull: true });
    await addColumnSafe(queryInterface, 'pos_transactions', 'fnb_guest_count', { type: Sequelize.INTEGER, allowNull: true });
    await addColumnSafe(queryInterface, 'pos_transactions', 'fnb_server_id', { type: Sequelize.INTEGER, allowNull: true });
    await addColumnSafe(queryInterface, 'pos_transactions', 'restaurant_service_charge_amount', { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 });
    await addColumnSafe(queryInterface, 'pos_transactions', 'restaurant_service_charge_label_snapshot', { type: Sequelize.STRING(120), allowNull: true });
    await addColumnSafe(queryInterface, 'pos_transactions', 'restaurant_service_charge_rate_snapshot', { type: Sequelize.DECIMAL(7, 4), allowNull: true });
    await addColumnSafe(queryInterface, 'pos_transactions', 'restaurant_service_charge_taxable', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    await addColumnSafe(queryInterface, 'pos_transactions', 'fnb_metadata', { type: Sequelize.JSON, allowNull: true });
    await addColumnSafe(queryInterface, 'pos_transaction_lines', 'fnb_course_snapshot', { type: Sequelize.ENUM('appetizer', 'main', 'dessert', 'drink', 'other'), allowNull: true });
    await addColumnSafe(queryInterface, 'pos_transaction_lines', 'fnb_modifiers_snapshot', { type: Sequelize.JSON, allowNull: true });
    await addColumnSafe(queryInterface, 'pos_transaction_lines', 'fnb_special_instructions', { type: Sequelize.TEXT, allowNull: true });
    await addColumnSafe(queryInterface, 'pos_transaction_lines', 'fnb_kitchen_station_snapshot', { type: Sequelize.JSON, allowNull: true });

    const indexSpecs = [
      ['fnb_modifier_options', ['modifier_group_id'], 'idx_fnb_modifier_options_group'],
      ['fnb_item_modifier_groups', ['item_id', 'modifier_group_id'], 'uq_fnb_item_modifier_groups_item_group', true],
      ['fnb_dining_tables', ['dining_area_id'], 'idx_fnb_tables_area'],
      ['fnb_dining_tables', ['status'], 'idx_fnb_tables_status'],
      ['fnb_dining_tables', ['qr_slug'], 'uq_fnb_tables_qr_slug', true],
      ['fnb_item_kitchen_routes', ['item_id'], 'idx_fnb_routes_item'],
      ['fnb_checks', ['status'], 'idx_fnb_checks_status'],
      ['fnb_checks', ['table_id'], 'idx_fnb_checks_table'],
      ['fnb_check_lines', ['check_id'], 'idx_fnb_check_lines_check'],
      ['fnb_kitchen_tickets', ['status'], 'idx_fnb_tickets_status'],
      ['fnb_kitchen_tickets', ['ticket_number'], 'uq_fnb_tickets_number', true],
      ['fnb_reservation_requests', ['requested_at'], 'idx_fnb_reservations_requested_at'],
      ['fnb_reservation_requests', ['table_id', 'requested_at'], 'idx_fnb_reservations_table_requested'],
      ['fnb_reservation_tables', ['reservation_request_id', 'table_id'], 'uq_fnb_reservation_tables_reservation_table', true],
      ['fnb_reservation_tables', ['table_id'], 'idx_fnb_reservation_tables_table'],
      ['fnb_restaurant_service_charge_snapshots', ['pos_transaction_id'], 'idx_fnb_service_charge_txn'],
      ['pos_transactions', ['fnb_check_id'], 'idx_pos_transactions_fnb_check'],
      ['pos_transactions', ['fnb_table_id'], 'idx_pos_transactions_fnb_table'],
      ['pos_transactions', ['fnb_server_id'], 'idx_pos_transactions_fnb_server']
    ];
    for (const [tableName, fields, name, unique] of indexSpecs) {
      await addIndexSafe(queryInterface, tableName, fields, { name, unique: Boolean(unique) });
    }

    const [rows] = await queryInterface.sequelize.query(
      "SELECT setting_key FROM system_settings WHERE setting_key = 'fnb_restaurant_service_charge'"
    ).catch(() => [[]]);
    if (Array.isArray(rows) && rows.length === 0) {
      await queryInterface.bulkInsert('system_settings', [{
        setting_key: 'fnb_restaurant_service_charge',
        setting_value: JSON.stringify({
          enabled: false,
          label: 'Restaurant service charge',
          rate: 0,
          taxable: false
        }),
        data_type: 'json',
        description: 'Food & Beverage restaurant service charge settings',
        updated_at: new Date()
      }]);
    }
  },

  async down(queryInterface) {
    const posLineColumns = [
      'fnb_kitchen_station_snapshot',
      'fnb_special_instructions',
      'fnb_modifiers_snapshot',
      'fnb_course_snapshot'
    ];
    for (const columnName of posLineColumns) {
      if (await columnExists(queryInterface, 'pos_transaction_lines', columnName)) {
        await queryInterface.removeColumn('pos_transaction_lines', columnName);
      }
    }

    const posColumns = [
      'fnb_metadata',
      'restaurant_service_charge_taxable',
      'restaurant_service_charge_rate_snapshot',
      'restaurant_service_charge_label_snapshot',
      'restaurant_service_charge_amount',
      'fnb_server_id',
      'fnb_guest_count',
      'fnb_table_label_snapshot',
      'fnb_table_id',
      'fnb_check_id'
    ];
    for (const columnName of posColumns) {
      if (await columnExists(queryInterface, 'pos_transactions', columnName)) {
        await queryInterface.removeColumn('pos_transactions', columnName);
      }
    }

    const tables = [
      'fnb_restaurant_service_charge_snapshots',
      'fnb_reservation_tables',
      'fnb_reservation_requests',
      'fnb_kitchen_tickets',
      'fnb_check_lines',
      'fnb_checks',
      'fnb_item_kitchen_routes',
      'fnb_kitchen_stations',
      'fnb_dining_tables',
      'fnb_dining_areas',
      'fnb_item_modifier_groups',
      'fnb_modifier_options',
      'fnb_modifier_groups'
    ];
    for (const tableName of tables) {
      if (await tableExists(queryInterface, tableName)) {
        await queryInterface.dropTable(tableName);
      }
    }

    await queryInterface.bulkDelete('system_settings', {
      setting_key: 'fnb_restaurant_service_charge'
    }).catch(() => {});
  }
};
