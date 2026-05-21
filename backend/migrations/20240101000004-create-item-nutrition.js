export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('item_nutrition', {
      nutrition_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      item_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'items',
          key: 'item_id'
        },
        onDelete: 'CASCADE'
      },
      serving_size: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      calories: {
        type: Sequelize.DECIMAL(8, 2),
        allowNull: true
      },
      total_fat: {
        type: Sequelize.DECIMAL(8, 2),
        allowNull: true
      },
      saturated_fat: {
        type: Sequelize.DECIMAL(8, 2),
        allowNull: true
      },
      cholesterol: {
        type: Sequelize.DECIMAL(8, 2),
        allowNull: true
      },
      sodium: {
        type: Sequelize.DECIMAL(8, 2),
        allowNull: true
      },
      total_carbohydrates: {
        type: Sequelize.DECIMAL(8, 2),
        allowNull: true
      },
      dietary_fiber: {
        type: Sequelize.DECIMAL(8, 2),
        allowNull: true
      },
      sugars: {
        type: Sequelize.DECIMAL(8, 2),
        allowNull: true
      },
      protein: {
        type: Sequelize.DECIMAL(8, 2),
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

    await queryInterface.addIndex('item_nutrition', ['item_id'], { name: 'idx_item_id' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('item_nutrition');
  }
};

