module.exports = {
  up: async (queryInterface, Sequelize) => {
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

    await queryInterface.addColumn('items', 'deleted_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('items', 'deleted_by');
    await queryInterface.removeColumn('items', 'deleted_at');
  }
};
