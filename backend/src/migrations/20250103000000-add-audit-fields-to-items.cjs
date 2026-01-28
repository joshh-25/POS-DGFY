module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDefinition = await queryInterface.describeTable('items');

    if (!tableDefinition.deleted_by) {
      await queryInterface.addColumn('items', 'deleted_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    if (!tableDefinition.deleted_at) {
      await queryInterface.addColumn('items', 'deleted_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('items', 'deleted_by');
    await queryInterface.removeColumn('items', 'deleted_at');
  }
};
