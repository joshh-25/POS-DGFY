export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('item_shelf_life', {
      shelf_life_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      item_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'items',
          key: 'item_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      duration_days: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      opened_shelf_life_days: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      storage_temperature: {
        type: Sequelize.ENUM('frozen', 'refrigerated', 'cool', 'room', 'ambient'),
        allowNull: true
      },
      storage_conditions: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('item_shelf_life', ['item_id'], {
      name: 'idx_item_shelf_life_item_id'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('item_shelf_life');
  }
};
