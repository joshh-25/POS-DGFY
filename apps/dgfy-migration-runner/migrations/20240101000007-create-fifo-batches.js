export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('fifo_batches', {
      batch_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      item_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'items',
          key: 'item_id'
        },
        onDelete: 'CASCADE'
      },
      quantity: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      cost_per_unit: {
        type: Sequelize.DECIMAL(10, 4),
        allowNull: true
      },
      received_date: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      expiry_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      po_number: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      quantity_consumed: {
        type: Sequelize.DECIMAL(12, 2),
        defaultValue: 0
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

    await queryInterface.addIndex('fifo_batches', ['item_id'], { name: 'idx_item_id' });
    await queryInterface.addIndex('fifo_batches', ['expiry_date'], { name: 'idx_expiry_date' });
    await queryInterface.addIndex('fifo_batches', ['received_date'], { name: 'idx_received_date' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('fifo_batches');
  }
};

