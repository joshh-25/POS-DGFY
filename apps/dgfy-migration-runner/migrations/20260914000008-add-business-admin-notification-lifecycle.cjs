'use strict';

const tableExists = async (queryInterface, tableName) => (await queryInterface.showAllTables())
  .some((entry) => String(entry).toLowerCase() === tableName.toLowerCase());

const columnExists = async (queryInterface, tableName, columnName) => {
  const columns = await queryInterface.describeTable(tableName);
  return Boolean(columns[columnName]);
};

const indexExists = async (queryInterface, tableName, indexName) => {
  const indexes = await queryInterface.showIndex(tableName);
  return indexes.some((index) => index.name === indexName);
};

const addColumnIfMissing = async (queryInterface, tableName, columnName, definition) => {
  if (!await columnExists(queryInterface, tableName, columnName)) await queryInterface.addColumn(tableName, columnName, definition);
};

const addIndexIfMissing = async (queryInterface, tableName, fields, name, options = {}) => {
  if (!await indexExists(queryInterface, tableName, name)) await queryInterface.addIndex(tableName, fields, { name, ...options });
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!await tableExists(queryInterface, 'business_admin_alert_snapshots')) return;

    await addColumnIfMissing(queryInterface, 'business_admin_alert_snapshots', 'source_domain', { type: Sequelize.STRING(80), allowNull: false, defaultValue: 'operations' });
    await addColumnIfMissing(queryInterface, 'business_admin_alert_snapshots', 'source_entity_type', { type: Sequelize.STRING(80), allowNull: true });
    await addColumnIfMissing(queryInterface, 'business_admin_alert_snapshots', 'source_entity_id', { type: Sequelize.STRING(120), allowNull: true });
    await addColumnIfMissing(queryInterface, 'business_admin_alert_snapshots', 'branch_id', { type: Sequelize.INTEGER, allowNull: true });
    await addColumnIfMissing(queryInterface, 'business_admin_alert_snapshots', 'target_route', { type: Sequelize.STRING(500), allowNull: true });
    await addColumnIfMissing(queryInterface, 'business_admin_alert_snapshots', 'acknowledged_at', { type: Sequelize.DATE, allowNull: true });
    await addColumnIfMissing(queryInterface, 'business_admin_alert_snapshots', 'acknowledged_by', { type: Sequelize.INTEGER, allowNull: true });
    await addColumnIfMissing(queryInterface, 'business_admin_alert_snapshots', 'acknowledgement_note', { type: Sequelize.STRING(500), allowNull: true });
    await addIndexIfMissing(queryInterface, 'business_admin_alert_snapshots', ['branch_id', 'status', 'last_seen_at'], 'idx_business_admin_alert_branch_status_seen');

    if (!await tableExists(queryInterface, 'business_admin_notification_states')) {
      await queryInterface.createTable('business_admin_notification_states', {
        business_admin_notification_state_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        business_admin_alert_snapshot_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'business_admin_alert_snapshots', key: 'business_admin_alert_snapshot_id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        user_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'user_id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        read_at: { type: Sequelize.DATE, allowNull: true },
        dismissed_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }
    await addIndexIfMissing(queryInterface, 'business_admin_notification_states', ['business_admin_alert_snapshot_id', 'user_id'], 'uq_business_admin_notification_state_alert_user', { unique: true });
    await addIndexIfMissing(queryInterface, 'business_admin_notification_states', ['user_id', 'read_at', 'dismissed_at'], 'idx_business_admin_notification_state_user_unread');
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'business_admin_notification_states')) await queryInterface.dropTable('business_admin_notification_states');
    if (!await tableExists(queryInterface, 'business_admin_alert_snapshots')) return;
    const columns = await queryInterface.describeTable('business_admin_alert_snapshots');
    for (const column of ['acknowledgement_note', 'acknowledged_by', 'acknowledged_at', 'target_route', 'branch_id', 'source_entity_id', 'source_entity_type', 'source_domain']) {
      if (columns[column]) await queryInterface.removeColumn('business_admin_alert_snapshots', column);
    }
  }
};
