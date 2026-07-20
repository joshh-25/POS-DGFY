export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('batch_transactions', {
      transaction_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      movement_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'stock_movements',
          key: 'movement_id'
        },
        onDelete: 'CASCADE'
      },
      batch_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'fifo_batches',
          key: 'batch_id'
        }
      },
      quantity_consumed: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      remaining_after: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true
      },
      cost_per_unit: {
        type: Sequelize.DECIMAL(10, 4),
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('batch_transactions', ['movement_id'], { name: 'idx_movement_id' });
    await queryInterface.addIndex('batch_transactions', ['batch_id'], { name: 'idx_batch_id' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('batch_transactions');
  }
};

