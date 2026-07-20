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

const addColumnIfMissing = async (queryInterface, tableName, columnName, definition) => {
  if (!await hasColumn(queryInterface, tableName, columnName)) {
    await queryInterface.addColumn(tableName, columnName, definition);
  }
};

const removeIndexIfExists = async (queryInterface, tableName, indexName) => {
  if (await hasIndex(queryInterface, tableName, indexName)) {
    await queryInterface.removeIndex(tableName, indexName);
  }
};

const removeColumnIfExists = async (queryInterface, tableName, columnName) => {
  if (await hasColumn(queryInterface, tableName, columnName)) {
    await queryInterface.removeColumn(tableName, columnName);
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (await tableExists(queryInterface, 'store_customers') && !await hasColumn(queryInterface, 'store_customers', 'dgfy_account_id')) {
      await queryInterface.addColumn('store_customers', 'dgfy_account_id', {
        type: Sequelize.UUID,
        allowNull: true
      });
      await addIndexIfMissing(queryInterface, 'store_customers', ['dgfy_account_id'], {
        name: 'idx_store_customers_dgfy_account_id'
      });
    }

    if (!await tableExists(queryInterface, 'dgfy_customer_activities')) {
      await queryInterface.createTable('dgfy_customer_activities', {
        activity_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        dgfy_account_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'dgfy_accounts', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        tenant_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'tenants', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        store_customer_id: { type: Sequelize.INTEGER, allowNull: true },
        activity_type: {
          type: Sequelize.ENUM('order', 'service_booking', 'hospitality_booking'),
          allowNull: false,
          defaultValue: 'order'
        },
        reference: { type: Sequelize.STRING(80), allowNull: false },
        store_slug: { type: Sequelize.STRING(160), allowNull: true },
        store_name: { type: Sequelize.STRING(255), allowNull: true },
        status: { type: Sequelize.STRING(60), allowNull: true },
        status_label: { type: Sequelize.STRING(120), allowNull: true },
        payment_status: { type: Sequelize.STRING(60), allowNull: true },
        total_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: true },
        currency: { type: Sequelize.STRING(12), allowNull: false, defaultValue: 'PHP' },
        customer_email: { type: Sequelize.STRING(255), allowNull: true },
        customer_phone: { type: Sequelize.STRING(80), allowNull: true },
        display_snapshot: { type: Sequelize.JSON, allowNull: true },
        occurred_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }

    await addIndexIfMissing(queryInterface, 'dgfy_customer_activities', ['dgfy_account_id', 'occurred_at'], { name: 'idx_dgfy_customer_activities_account_time' });
    await addIndexIfMissing(queryInterface, 'dgfy_customer_activities', ['tenant_id', 'activity_type', 'reference'], { unique: true, name: 'unique_dgfy_customer_activity_reference' });
    await addIndexIfMissing(queryInterface, 'dgfy_customer_activities', ['customer_email'], { name: 'idx_dgfy_customer_activities_email' });
    await addIndexIfMissing(queryInterface, 'dgfy_customer_activities', ['customer_phone'], { name: 'idx_dgfy_customer_activities_phone' });

    if (!await tableExists(queryInterface, 'dgfy_customer_addresses')) {
      await queryInterface.createTable('dgfy_customer_addresses', {
        address_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        dgfy_account_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'dgfy_accounts', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        label: { type: Sequelize.STRING(100), allowNull: false, defaultValue: 'Address' },
        address_line: { type: Sequelize.TEXT, allowNull: false },
        latitude: { type: Sequelize.DECIMAL(10, 8), allowNull: true },
        longitude: { type: Sequelize.DECIMAL(11, 8), allowNull: true },
        is_default: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }

    await addIndexIfMissing(queryInterface, 'dgfy_customer_addresses', ['dgfy_account_id', 'is_default'], { name: 'idx_dgfy_customer_addresses_default' });

    if (!await tableExists(queryInterface, 'dgfy_customer_reviews')) {
      await queryInterface.createTable('dgfy_customer_reviews', {
        review_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        dgfy_account_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'dgfy_accounts', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        activity_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'dgfy_customer_activities', key: 'activity_id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        tenant_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'tenants', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        item_id: { type: Sequelize.INTEGER, allowNull: false },
        rating: { type: Sequelize.INTEGER, allowNull: false },
        comment: { type: Sequelize.TEXT, allowNull: true },
        status: { type: Sequelize.ENUM('pending', 'approved', 'rejected'), allowNull: false, defaultValue: 'pending' },
        submitted_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        reviewed_at: { type: Sequelize.DATE, allowNull: true },
        reviewed_by_admin_id: { type: Sequelize.INTEGER, allowNull: true },
        review_note: { type: Sequelize.TEXT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }

    if (!await hasColumn(queryInterface, 'dgfy_customer_reviews', 'reviewed_by_admin_id')) {
      await queryInterface.addColumn('dgfy_customer_reviews', 'reviewed_by_admin_id', { type: Sequelize.INTEGER, allowNull: true });
    }
    if (!await hasColumn(queryInterface, 'dgfy_customer_reviews', 'review_note')) {
      await queryInterface.addColumn('dgfy_customer_reviews', 'review_note', { type: Sequelize.TEXT, allowNull: true });
    }

    await addIndexIfMissing(queryInterface, 'dgfy_customer_reviews', ['dgfy_account_id', 'tenant_id', 'item_id'], { name: 'idx_dgfy_customer_reviews_account_item' });
    await addIndexIfMissing(queryInterface, 'dgfy_customer_reviews', ['tenant_id', 'item_id', 'status'], { name: 'idx_dgfy_customer_reviews_public' });

    if (!await tableExists(queryInterface, 'dgfy_customer_backfill_runs')) {
      await queryInterface.createTable('dgfy_customer_backfill_runs', {
        run_id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
        status: { type: Sequelize.ENUM('running', 'completed', 'failed'), allowNull: false, defaultValue: 'running' },
        dry_run: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        started_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        completed_at: { type: Sequelize.DATE, allowNull: true },
        tenant_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        transaction_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        order_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        service_booking_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        hospitality_booking_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        matched_account_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        activity_upsert_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        loyalty_upsert_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        failure_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        summary: { type: Sequelize.JSON, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }

    if (await tableExists(queryInterface, 'dgfy_customer_backfill_runs')) {
      await addColumnIfMissing(queryInterface, 'dgfy_customer_backfill_runs', 'order_count', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
      await addColumnIfMissing(queryInterface, 'dgfy_customer_backfill_runs', 'service_booking_count', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
      await addColumnIfMissing(queryInterface, 'dgfy_customer_backfill_runs', 'hospitality_booking_count', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
    }

    await addIndexIfMissing(queryInterface, 'dgfy_customer_backfill_runs', ['status', 'started_at'], { name: 'idx_dgfy_customer_backfill_runs_status_time' });

    if (!await tableExists(queryInterface, 'dgfy_loyalty_transactions')) {
      await queryInterface.createTable('dgfy_loyalty_transactions', {
        loyalty_transaction_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
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
        activity_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'dgfy_customer_activities', key: 'activity_id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        points_delta: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        reason: { type: Sequelize.STRING(120), allowNull: false, defaultValue: 'activity' },
        reference: { type: Sequelize.STRING(80), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }

    await addIndexIfMissing(queryInterface, 'dgfy_loyalty_transactions', ['dgfy_account_id', 'created_at'], { name: 'idx_dgfy_loyalty_account_time' });

    if (!await tableExists(queryInterface, 'dgfy_tracking_recovery_codes')) {
      await queryInterface.createTable('dgfy_tracking_recovery_codes', {
        recovery_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        lookup_hash: { type: Sequelize.STRING(80), allowNull: false },
        delivery_email: { type: Sequelize.STRING(255), allowNull: true },
        code_hash: { type: Sequelize.STRING(128), allowNull: false },
        attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        max_attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 5 },
        expires_at: { type: Sequelize.DATE, allowNull: false },
        consumed_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }

    await addIndexIfMissing(queryInterface, 'dgfy_tracking_recovery_codes', ['lookup_hash', 'consumed_at', 'expires_at'], { name: 'idx_dgfy_tracking_recovery_lookup' });
  },

  async down(queryInterface) {
    await removeIndexIfExists(queryInterface, 'store_customers', 'idx_store_customers_dgfy_account_id');
    await removeColumnIfExists(queryInterface, 'store_customers', 'dgfy_account_id');
    if (await tableExists(queryInterface, 'dgfy_tracking_recovery_codes')) await queryInterface.dropTable('dgfy_tracking_recovery_codes');
    if (await tableExists(queryInterface, 'dgfy_loyalty_transactions')) await queryInterface.dropTable('dgfy_loyalty_transactions');
    if (await tableExists(queryInterface, 'dgfy_customer_backfill_runs')) await queryInterface.dropTable('dgfy_customer_backfill_runs');
    if (await tableExists(queryInterface, 'dgfy_customer_reviews')) await queryInterface.dropTable('dgfy_customer_reviews');
    if (await tableExists(queryInterface, 'dgfy_customer_addresses')) await queryInterface.dropTable('dgfy_customer_addresses');
    if (await tableExists(queryInterface, 'dgfy_customer_activities')) await queryInterface.dropTable('dgfy_customer_activities');
  }
};
