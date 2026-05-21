export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('stock_movements', {
      movement_id: {
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
        }
      },
      movement_type: {
        type: Sequelize.ENUM('production_consumption', 'purchase_receipt', 'return', 'transfer', 'calculated_loss'),
        allowNull: false
      },
      quantity: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      from_location: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      to_location: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      reference_id: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      reference_type: {
        type: Sequelize.ENUM('PO', 'JO', 'MANUAL', 'RETURN'),
        defaultValue: 'MANUAL'
      },
      user_responsible: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'user_id'
        }
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      loss_reason: {
        type: Sequelize.ENUM('waste', 'spoilage', 'damage', 'pilferage'),
        allowNull: true
      },
      weighted_average_cost: {
        type: Sequelize.DECIMAL(10, 4),
        allowNull: true
      },
      timestamp: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('stock_movements', ['item_id'], { name: 'idx_item_id' });
    await queryInterface.addIndex('stock_movements', ['movement_type'], { name: 'idx_movement_type' });
    await queryInterface.addIndex('stock_movements', ['timestamp'], { name: 'idx_timestamp' });
    await queryInterface.addIndex('stock_movements', ['reference_id'], { name: 'idx_reference_id' });
    await queryInterface.addIndex('stock_movements', ['item_id', 'timestamp'], { name: 'idx_item_timestamp' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('stock_movements');
  }
};

