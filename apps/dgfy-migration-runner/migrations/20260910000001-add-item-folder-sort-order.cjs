'use strict';

const hasColumn = async (queryInterface, tableName, columnName) => {
  const definition = await queryInterface.describeTable(tableName).catch(() => ({}));
  return Boolean(definition[columnName]);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasColumn(queryInterface, 'item_folders', 'sort_order'))) {
      await queryInterface.addColumn('item_folders', 'sort_order', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      });
    }

    const [folders] = await queryInterface.sequelize.query(
      'SELECT folder_id FROM item_folders WHERE deleted_at IS NULL ORDER BY name ASC, folder_id ASC'
    );
    const transaction = await queryInterface.sequelize.transaction();
    try {
      for (let index = 0; index < folders.length; index += 1) {
        await queryInterface.bulkUpdate('item_folders', { sort_order: index }, { folder_id: folders[index].folder_id }, { transaction });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    if (await hasColumn(queryInterface, 'item_folders', 'sort_order')) {
      await queryInterface.removeColumn('item_folders', 'sort_order');
    }
  }
};
