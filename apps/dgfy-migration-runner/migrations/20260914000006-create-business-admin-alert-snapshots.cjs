'use strict';

const tableExists = async (queryInterface, tableName) => (await queryInterface.showAllTables())
  .some((entry) => String(entry).toLowerCase() === tableName.toLowerCase());

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
  const indexes = await queryInterface.showIndex(tableName);
  if (!indexes.some((index) => index.name === options.name)) await queryInterface.addIndex(tableName, fields, options);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!await tableExists(queryInterface, 'business_admin_alert_snapshots')) {
      await queryInterface.createTable('business_admin_alert_snapshots', {
        business_admin_alert_snapshot_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        alert_key: { type: Sequelize.STRING(128), allowNull: false, unique: true },
        alert_type: { type: Sequelize.STRING(80), allowNull: false },
        severity: { type: Sequelize.STRING(20), allowNull: false },
        message: { type: Sequelize.STRING(500), allowNull: false },
        source_domain: { type: Sequelize.STRING(80), allowNull: false, defaultValue: 'operations' },
        source_entity_type: { type: Sequelize.STRING(80), allowNull: true },
        source_entity_id: { type: Sequelize.STRING(120), allowNull: true },
        branch_id: { type: Sequelize.INTEGER, allowNull: true },
        target_route: { type: Sequelize.STRING(500), allowNull: true },
        payload: { type: Sequelize.JSON, allowNull: false },
        status: { type: Sequelize.ENUM('open', 'resolved'), allowNull: false, defaultValue: 'open' },
        acknowledged_at: { type: Sequelize.DATE, allowNull: true },
        acknowledged_by: { type: Sequelize.INTEGER, allowNull: true },
        acknowledgement_note: { type: Sequelize.STRING(500), allowNull: true },
        first_detected_at: { type: Sequelize.DATE, allowNull: false },
        last_seen_at: { type: Sequelize.DATE, allowNull: false },
        resolved_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }
    await addIndexIfMissing(queryInterface, 'business_admin_alert_snapshots', ['status', 'severity', 'last_seen_at'], { name: 'idx_business_admin_alert_status_seen' });
    await addIndexIfMissing(queryInterface, 'business_admin_alert_snapshots', ['alert_type', 'status'], { name: 'idx_business_admin_alert_type_status' });
    await addIndexIfMissing(queryInterface, 'business_admin_alert_snapshots', ['branch_id', 'status', 'last_seen_at'], { name: 'idx_business_admin_alert_branch_status_seen' });
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'business_admin_alert_snapshots')) await queryInterface.dropTable('business_admin_alert_snapshots');
  }
};
