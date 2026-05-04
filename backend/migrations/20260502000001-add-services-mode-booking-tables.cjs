'use strict';

const TABLES = Object.freeze({
  ITEMS: 'items',
  POS_TRANSACTIONS: 'pos_transactions',
  STOREFRONT_DISCOVERY_INDEX: 'storefront_discovery_index',
  SERVICE_ITEM_DETAILS: 'service_item_details',
  SERVICE_RESOURCES: 'service_resources',
  SERVICE_PROVIDER_ASSIGNMENTS: 'service_provider_assignments',
  SERVICE_BOOKINGS: 'service_bookings',
  SERVICE_WAITLIST_ENTRIES: 'service_waitlist_entries'
});

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
  try {
    const table = await queryInterface.describeTable(tableName);
    return Boolean(table && table[columnName]);
  } catch {
    return false;
  }
};

const addIndexSafe = async (queryInterface, tableName, fields, options = {}) => {
  try {
    await queryInterface.addIndex(tableName, fields, options);
  } catch (error) {
    const message = String(error?.original?.sqlMessage || error?.message || '');
    if (!/Duplicate key name|already exists/i.test(message)) {
      throw error;
    }
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (await tableExists(queryInterface, TABLES.ITEMS)) {
      await queryInterface.changeColumn(TABLES.ITEMS, 'category', {
        type: Sequelize.ENUM('raw_material', 'packaging', 'product', 'supplies', 'service'),
        allowNull: false
      });
    }

    if (await tableExists(queryInterface, TABLES.POS_TRANSACTIONS)) {
      await queryInterface.changeColumn(TABLES.POS_TRANSACTIONS, 'order_method', {
        type: Sequelize.ENUM('dine_in', 'takeout', 'pickup', 'delivery', 'online', 'appointment'),
        allowNull: false,
        defaultValue: 'dine_in'
      });
      await queryInterface.changeColumn(TABLES.POS_TRANSACTIONS, 'service_fee_method_snapshot', {
        type: Sequelize.ENUM('dine_in', 'takeout', 'pickup', 'delivery', 'online', 'appointment'),
        allowNull: true
      });
    }

    if (
      await tableExists(queryInterface, TABLES.STOREFRONT_DISCOVERY_INDEX)
      && !(await columnExists(queryInterface, TABLES.STOREFRONT_DISCOVERY_INDEX, 'workflow_mode'))
    ) {
      await queryInterface.addColumn(TABLES.STOREFRONT_DISCOVERY_INDEX, 'workflow_mode', {
        type: Sequelize.STRING(80),
        allowNull: false,
        defaultValue: 'food_manufacturing'
      });
      await addIndexSafe(queryInterface, TABLES.STOREFRONT_DISCOVERY_INDEX, ['workflow_mode'], {
        name: 'idx_storefront_discovery_workflow_mode'
      });
    }

    if (!(await tableExists(queryInterface, TABLES.SERVICE_ITEM_DETAILS))) {
      await queryInterface.createTable(TABLES.SERVICE_ITEM_DETAILS, {
        service_detail_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        item_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: TABLES.ITEMS, key: 'item_id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        service_category: { type: Sequelize.STRING(120), allowNull: true },
        duration_minutes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 60 },
        buffer_before_minutes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        buffer_after_minutes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        lead_time_minutes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        cancellation_window_hours: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 24 },
        bookable: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        visible_in_storefront: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        visible_in_pos: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        payment_policy: {
          type: Sequelize.ENUM('customer_choice', 'prepaid_required', 'postpaid_only', 'deposit_allowed'),
          allowNull: false,
          defaultValue: 'customer_choice'
        },
        service_area_type: {
          type: Sequelize.ENUM('in_store', 'customer_location', 'online', 'hybrid'),
          allowNull: false,
          defaultValue: 'in_store'
        },
        intake_form_schema: { type: Sequelize.JSON, allowNull: true },
        client_notes_template: { type: Sequelize.TEXT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await addIndexSafe(queryInterface, TABLES.SERVICE_ITEM_DETAILS, ['item_id'], {
        unique: true,
        name: 'uq_service_item_details_item_id'
      });
      await addIndexSafe(queryInterface, TABLES.SERVICE_ITEM_DETAILS, ['service_category'], {
        name: 'idx_service_item_details_category'
      });
      await addIndexSafe(queryInterface, TABLES.SERVICE_ITEM_DETAILS, ['visible_in_storefront'], {
        name: 'idx_service_item_details_storefront_visible'
      });
    }

    if (!(await tableExists(queryInterface, TABLES.SERVICE_RESOURCES))) {
      await queryInterface.createTable(TABLES.SERVICE_RESOURCES, {
        resource_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        name: { type: Sequelize.STRING(255), allowNull: false },
        resource_type: {
          type: Sequelize.ENUM('provider', 'room', 'equipment', 'vehicle', 'station'),
          allowNull: false,
          defaultValue: 'provider'
        },
        location_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'tenant_locations', key: 'location_id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        capacity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        weekly_availability: { type: Sequelize.JSON, allowNull: true },
        blackout_dates: { type: Sequelize.JSON, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await addIndexSafe(queryInterface, TABLES.SERVICE_RESOURCES, ['resource_type'], { name: 'idx_service_resources_type' });
      await addIndexSafe(queryInterface, TABLES.SERVICE_RESOURCES, ['location_id'], { name: 'idx_service_resources_location' });
      await addIndexSafe(queryInterface, TABLES.SERVICE_RESOURCES, ['is_active'], { name: 'idx_service_resources_active' });
    }

    if (!(await tableExists(queryInterface, TABLES.SERVICE_PROVIDER_ASSIGNMENTS))) {
      await queryInterface.createTable(TABLES.SERVICE_PROVIDER_ASSIGNMENTS, {
        assignment_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        item_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: TABLES.ITEMS, key: 'item_id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'user_id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        resource_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: TABLES.SERVICE_RESOURCES, key: 'resource_id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        location_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'tenant_locations', key: 'location_id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await addIndexSafe(queryInterface, TABLES.SERVICE_PROVIDER_ASSIGNMENTS, ['item_id'], { name: 'idx_service_assignments_item' });
      await addIndexSafe(queryInterface, TABLES.SERVICE_PROVIDER_ASSIGNMENTS, ['user_id'], { name: 'idx_service_assignments_user' });
      await addIndexSafe(queryInterface, TABLES.SERVICE_PROVIDER_ASSIGNMENTS, ['resource_id'], { name: 'idx_service_assignments_resource' });
      await addIndexSafe(queryInterface, TABLES.SERVICE_PROVIDER_ASSIGNMENTS, ['location_id'], { name: 'idx_service_assignments_location' });
    }

    if (!(await tableExists(queryInterface, TABLES.SERVICE_BOOKINGS))) {
      await queryInterface.createTable(TABLES.SERVICE_BOOKINGS, {
        booking_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        public_reference: { type: Sequelize.STRING(40), allowNull: false, unique: true },
        service_item_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: TABLES.ITEMS, key: 'item_id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        service_detail_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: TABLES.SERVICE_ITEM_DETAILS, key: 'service_detail_id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        store_customer_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'store_customers', key: 'customer_id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        customer_name: { type: Sequelize.STRING(255), allowNull: false },
        customer_email: { type: Sequelize.STRING(255), allowNull: true },
        customer_phone: { type: Sequelize.STRING(50), allowNull: true },
        provider_user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'user_id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        resource_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: TABLES.SERVICE_RESOURCES, key: 'resource_id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        location_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'tenant_locations', key: 'location_id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        start_at: { type: Sequelize.DATE, allowNull: false },
        end_at: { type: Sequelize.DATE, allowNull: false },
        status: {
          type: Sequelize.ENUM('requested', 'confirmed', 'checked_in', 'in_service', 'completed', 'cancelled', 'no_show'),
          allowNull: false,
          defaultValue: 'requested'
        },
        payment_timing: {
          type: Sequelize.ENUM('prepaid', 'postpaid', 'deposit'),
          allowNull: false,
          defaultValue: 'postpaid'
        },
        payment_status: {
          type: Sequelize.ENUM('unpaid', 'payment_pending', 'paid', 'deposit_paid', 'failed', 'refunded'),
          allowNull: false,
          defaultValue: 'unpaid'
        },
        payment_reference: { type: Sequelize.STRING(120), allowNull: true },
        payment_checkout_url: { type: Sequelize.STRING(1000), allowNull: true },
        pos_transaction_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: TABLES.POS_TRANSACTIONS, key: 'pos_transaction_id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        source: {
          type: Sequelize.ENUM('storefront', 'pos', 'admin'),
          allowNull: false,
          defaultValue: 'storefront'
        },
        claim_token_hash: { type: Sequelize.STRING(128), allowNull: true },
        claim_token_expires_at: { type: Sequelize.DATE, allowNull: true },
        notes: { type: Sequelize.TEXT, allowNull: true },
        intake_responses: { type: Sequelize.JSON, allowNull: true },
        cancellation_reason: { type: Sequelize.STRING(500), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await addIndexSafe(queryInterface, TABLES.SERVICE_BOOKINGS, ['public_reference'], {
        unique: true,
        name: 'uq_service_bookings_public_reference'
      });
      await addIndexSafe(queryInterface, TABLES.SERVICE_BOOKINGS, ['service_item_id'], { name: 'idx_service_bookings_item' });
      await addIndexSafe(queryInterface, TABLES.SERVICE_BOOKINGS, ['store_customer_id'], { name: 'idx_service_bookings_customer' });
      await addIndexSafe(queryInterface, TABLES.SERVICE_BOOKINGS, ['provider_user_id'], { name: 'idx_service_bookings_provider' });
      await addIndexSafe(queryInterface, TABLES.SERVICE_BOOKINGS, ['resource_id'], { name: 'idx_service_bookings_resource' });
      await addIndexSafe(queryInterface, TABLES.SERVICE_BOOKINGS, ['status'], { name: 'idx_service_bookings_status' });
      await addIndexSafe(queryInterface, TABLES.SERVICE_BOOKINGS, ['start_at'], { name: 'idx_service_bookings_start_at' });
      await addIndexSafe(queryInterface, TABLES.SERVICE_BOOKINGS, ['payment_status'], { name: 'idx_service_bookings_payment_status' });
    }

    if (!(await tableExists(queryInterface, TABLES.SERVICE_WAITLIST_ENTRIES))) {
      await queryInterface.createTable(TABLES.SERVICE_WAITLIST_ENTRIES, {
        waitlist_entry_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        service_item_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: TABLES.ITEMS, key: 'item_id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        store_customer_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'store_customers', key: 'customer_id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        customer_name: { type: Sequelize.STRING(255), allowNull: false },
        customer_email: { type: Sequelize.STRING(255), allowNull: true },
        customer_phone: { type: Sequelize.STRING(50), allowNull: true },
        preferred_start_at: { type: Sequelize.DATE, allowNull: true },
        preferred_end_at: { type: Sequelize.DATE, allowNull: true },
        status: {
          type: Sequelize.ENUM('waiting', 'notified', 'booked', 'expired', 'cancelled'),
          allowNull: false,
          defaultValue: 'waiting'
        },
        notes: { type: Sequelize.TEXT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await addIndexSafe(queryInterface, TABLES.SERVICE_WAITLIST_ENTRIES, ['service_item_id'], { name: 'idx_service_waitlist_item' });
      await addIndexSafe(queryInterface, TABLES.SERVICE_WAITLIST_ENTRIES, ['store_customer_id'], { name: 'idx_service_waitlist_customer' });
      await addIndexSafe(queryInterface, TABLES.SERVICE_WAITLIST_ENTRIES, ['status'], { name: 'idx_service_waitlist_status' });
    }
  },

  async down(queryInterface, Sequelize) {
    if (await tableExists(queryInterface, TABLES.SERVICE_WAITLIST_ENTRIES)) {
      await queryInterface.dropTable(TABLES.SERVICE_WAITLIST_ENTRIES);
    }
    if (await tableExists(queryInterface, TABLES.SERVICE_BOOKINGS)) {
      await queryInterface.dropTable(TABLES.SERVICE_BOOKINGS);
    }
    if (await tableExists(queryInterface, TABLES.SERVICE_PROVIDER_ASSIGNMENTS)) {
      await queryInterface.dropTable(TABLES.SERVICE_PROVIDER_ASSIGNMENTS);
    }
    if (await tableExists(queryInterface, TABLES.SERVICE_RESOURCES)) {
      await queryInterface.dropTable(TABLES.SERVICE_RESOURCES);
    }
    if (await tableExists(queryInterface, TABLES.SERVICE_ITEM_DETAILS)) {
      await queryInterface.dropTable(TABLES.SERVICE_ITEM_DETAILS);
    }

    if (
      await tableExists(queryInterface, TABLES.STOREFRONT_DISCOVERY_INDEX)
      && await columnExists(queryInterface, TABLES.STOREFRONT_DISCOVERY_INDEX, 'workflow_mode')
    ) {
      await queryInterface.removeIndex(TABLES.STOREFRONT_DISCOVERY_INDEX, 'idx_storefront_discovery_workflow_mode').catch(() => {});
      await queryInterface.removeColumn(TABLES.STOREFRONT_DISCOVERY_INDEX, 'workflow_mode');
    }

    if (await tableExists(queryInterface, TABLES.POS_TRANSACTIONS)) {
      await queryInterface.changeColumn(TABLES.POS_TRANSACTIONS, 'order_method', {
        type: Sequelize.ENUM('dine_in', 'takeout', 'pickup', 'delivery', 'online'),
        allowNull: false,
        defaultValue: 'dine_in'
      });
      await queryInterface.changeColumn(TABLES.POS_TRANSACTIONS, 'service_fee_method_snapshot', {
        type: Sequelize.ENUM('dine_in', 'takeout', 'pickup', 'delivery', 'online'),
        allowNull: true
      });
    }

    if (await tableExists(queryInterface, TABLES.ITEMS)) {
      await queryInterface.sequelize.query(`UPDATE ${TABLES.ITEMS} SET category = 'supplies' WHERE category = 'service'`);
      await queryInterface.changeColumn(TABLES.ITEMS, 'category', {
        type: Sequelize.ENUM('raw_material', 'packaging', 'product', 'supplies'),
        allowNull: false
      });
    }
  }
};
