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
    const dialect = queryInterface.sequelize.getDialect();

    if (dialect === 'mysql' || dialect === 'mariadb') {
      await queryInterface.sequelize.query(
        "ALTER TABLE dgfy_customer_activities MODIFY activity_type ENUM('order','service_booking','hospitality_booking','fnb_order') NOT NULL DEFAULT 'order'"
      );
    }

    await addColumnIfMissing(queryInterface, 'dgfy_customer_backfill_runs', 'fnb_order_count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    await addColumnIfMissing(queryInterface, 'dgfy_customer_reviews', 'target_type', {
      type: Sequelize.ENUM('product', 'service', 'hospitality_booking', 'fnb_order', 'fnb_item'),
      allowNull: false,
      defaultValue: 'product'
    });
    await addColumnIfMissing(queryInterface, 'dgfy_customer_reviews', 'target_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
    await addColumnIfMissing(queryInterface, 'dgfy_customer_reviews', 'anonymous', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    await queryInterface.changeColumn('dgfy_customer_reviews', 'item_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    }).catch(() => null);

    await addIndexIfMissing(queryInterface, 'dgfy_customer_reviews', ['dgfy_account_id', 'activity_id', 'target_type', 'target_id'], {
      name: 'idx_dgfy_customer_reviews_account_target'
    });
    await addIndexIfMissing(queryInterface, 'dgfy_customer_reviews', ['tenant_id', 'target_type', 'target_id', 'status'], {
      name: 'idx_dgfy_customer_reviews_public_target'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('dgfy_customer_reviews', 'idx_dgfy_customer_reviews_public_target').catch(() => null);
    await queryInterface.removeIndex('dgfy_customer_reviews', 'idx_dgfy_customer_reviews_account_target').catch(() => null);
    await queryInterface.removeColumn('dgfy_customer_reviews', 'anonymous').catch(() => null);
    await queryInterface.removeColumn('dgfy_customer_reviews', 'target_id').catch(() => null);
    await queryInterface.removeColumn('dgfy_customer_reviews', 'target_type').catch(() => null);
    await queryInterface.removeColumn('dgfy_customer_backfill_runs', 'fnb_order_count').catch(() => null);

    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === 'mysql' || dialect === 'mariadb') {
      await queryInterface.sequelize.query(
        "ALTER TABLE dgfy_customer_activities MODIFY activity_type ENUM('order','service_booking','hospitality_booking') NOT NULL DEFAULT 'order'"
      ).catch(() => null);
    }
  }
};
