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

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!await tableExists(queryInterface, 'dgfy_customer_notifications')) {
      await queryInterface.createTable('dgfy_customer_notifications', {
        notification_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
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
        reference: { type: Sequelize.STRING(80), allowNull: true },
        event_key: { type: Sequelize.STRING(180), allowNull: true, unique: true },
        type: { type: Sequelize.STRING(80), allowNull: false, defaultValue: 'order_status' },
        title: { type: Sequelize.STRING(160), allowNull: false },
        body: { type: Sequelize.STRING(500), allowNull: true },
        status: { type: Sequelize.STRING(60), allowNull: true },
        read_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }

    await addIndexIfMissing(queryInterface, 'dgfy_customer_notifications', ['dgfy_account_id', 'created_at'], { name: 'idx_dgfy_customer_notifications_account_time' });
    await addIndexIfMissing(queryInterface, 'dgfy_customer_notifications', ['dgfy_account_id', 'read_at'], { name: 'idx_dgfy_customer_notifications_account_read' });
    await addIndexIfMissing(queryInterface, 'dgfy_customer_notifications', ['reference'], { name: 'idx_dgfy_customer_notifications_reference' });
    await addIndexIfMissing(queryInterface, 'dgfy_customer_notifications', ['event_key'], { unique: true, name: 'unique_dgfy_customer_notification_event' });
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'dgfy_customer_notifications')) {
      await queryInterface.dropTable('dgfy_customer_notifications');
    }
  }
};
