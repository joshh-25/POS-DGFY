'use strict';

module.exports = {
  async up(queryInterface) {
    const tableDescription = await queryInterface.describeTable('items');

    if (!tableDescription.active_sku_code) {
      await queryInterface.sequelize.query(`
        ALTER TABLE items
        ADD COLUMN active_sku_code VARCHAR(50)
        GENERATED ALWAYS AS (
          CASE
            WHEN deleted_at IS NULL
              AND status NOT IN ('draft', 'inactive')
              AND sku_code IS NOT NULL
              AND TRIM(sku_code) <> ''
            THEN UPPER(TRIM(sku_code))
            ELSE NULL
          END
        ) STORED
      `);
    }

    const indexes = await queryInterface.showIndex('items');
    const hasUniqueIndex = indexes.some((index) => index.name === 'uq_items_active_sku_code');
    if (!hasUniqueIndex) {
      await queryInterface.addIndex('items', ['active_sku_code'], {
        name: 'uq_items_active_sku_code',
        unique: true
      });
    }
  },

  async down(queryInterface) {
    const indexes = await queryInterface.showIndex('items');
    const hasUniqueIndex = indexes.some((index) => index.name === 'uq_items_active_sku_code');
    if (hasUniqueIndex) {
      await queryInterface.removeIndex('items', 'uq_items_active_sku_code');
    }

    const tableDescription = await queryInterface.describeTable('items');
    if (tableDescription.active_sku_code) {
      await queryInterface.removeColumn('items', 'active_sku_code');
    }
  }
};
