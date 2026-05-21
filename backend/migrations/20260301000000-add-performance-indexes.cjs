'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const addIfNotExists = async (table, fields, name) => {
      try {
        await queryInterface.addIndex(table, fields, { name });
      } catch (e) {
        // MySQL throws "Duplicate key name" if the index already exists.
        // This is the actual idempotency guard — ifNotExists is silently ignored by Sequelize's MySQL dialect.
        if (!e.message?.includes('Duplicate key name') && !e.message?.includes('already exists')) {
          throw e;
        }
      }
    };

    // stock_movements: queried heavily by item_id, movement_type, and timestamp
    await addIfNotExists('stock_movements', ['item_id'], 'idx_stock_movements_item_id');
    await addIfNotExists('stock_movements', ['movement_type'], 'idx_stock_movements_movement_type');
    await addIfNotExists('stock_movements', ['timestamp'], 'idx_stock_movements_timestamp');
    await addIfNotExists('stock_movements', ['item_id', 'movement_type', 'timestamp'], 'idx_stock_movements_item_type_time');

    // items: nearly every query filters by status='active'
    await addIfNotExists('items', ['status'], 'idx_items_status');

    // purchase_orders: filtered by status frequently
    await addIfNotExists('purchase_orders', ['status'], 'idx_purchase_orders_status');
    await addIfNotExists('purchase_orders', ['supplier_id'], 'idx_purchase_orders_supplier_id');

    // job_orders: filtered by status frequently
    await addIfNotExists('job_orders', ['status'], 'idx_job_orders_status');
    await addIfNotExists('job_orders', ['product_id'], 'idx_job_orders_product_id');
  },

  async down(queryInterface) {
    const removeIfExists = async (table, name) => {
      try {
        await queryInterface.removeIndex(table, name);
      } catch (e) {
        // Index doesn't exist — skip silently
      }
    };

    await removeIfExists('stock_movements', 'idx_stock_movements_item_id');
    await removeIfExists('stock_movements', 'idx_stock_movements_movement_type');
    await removeIfExists('stock_movements', 'idx_stock_movements_timestamp');
    await removeIfExists('stock_movements', 'idx_stock_movements_item_type_time');
    await removeIfExists('items', 'idx_items_status');
    await removeIfExists('purchase_orders', 'idx_purchase_orders_status');
    await removeIfExists('purchase_orders', 'idx_purchase_orders_supplier_id');
    await removeIfExists('job_orders', 'idx_job_orders_status');
    await removeIfExists('job_orders', 'idx_job_orders_product_id');
  },
};
