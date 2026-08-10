'use strict';

const hasLeftmostIndex = (indexes, columnName) => indexes.some((index) => {
  const fields = Array.isArray(index.fields) ? index.fields : [];
  const firstField = fields[0];
  const firstFieldName = typeof firstField === 'string'
    ? firstField
    : firstField?.attribute || firstField?.name;

  return String(firstFieldName || '').toLowerCase() === columnName;
});

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const tableInfo = await queryInterface.describeTable('items');
    if (!tableInfo.deleted_at) {
      return;
    }

    const indexes = await queryInterface.showIndex('items').catch(() => []);
    if (!hasLeftmostIndex(indexes, 'deleted_at')) {
      await queryInterface.addIndex('items', ['deleted_at'], {
        name: 'idx_items_deleted_at'
      });
    }
  },

  async down(queryInterface) {
    const indexes = await queryInterface.showIndex('items').catch(() => []);
    if (indexes.some((index) => index.name === 'idx_items_deleted_at')) {
      await queryInterface.removeIndex('items', 'idx_items_deleted_at');
    }
  }
};
