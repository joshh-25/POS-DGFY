export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('jo_ingredients', {
      jo_ingredient_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      jo_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'job_orders',
          key: 'jo_id'
        },
        onDelete: 'CASCADE'
      },
      item_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'items',
          key: 'item_id'
        }
      },
      quantity_required: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      quantity_consumed: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true
      },
      stock_before: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true
      },
      stock_after: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('jo_ingredients', ['jo_id'], { name: 'idx_jo_id' });
    await queryInterface.addIndex('jo_ingredients', ['item_id'], { name: 'idx_item_id' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('jo_ingredients');
  }
};

