export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('purchase_orders', {
      po_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      po_number: {
        type: Sequelize.STRING(50),
        unique: true,
        allowNull: false
      },
      supplier_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'suppliers',
          key: 'supplier_id'
        }
      },
      order_date: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      expected_delivery_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      received_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('pending', 'partial', 'received', 'cancelled'),
        defaultValue: 'pending'
      },
      subtotal: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true
      },
      discount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true
      },
      total_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true
      },
      delivery_rating: {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'user_id'
        }
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

    await queryInterface.addIndex('purchase_orders', ['po_number'], { name: 'idx_po_number' });
    await queryInterface.addIndex('purchase_orders', ['supplier_id'], { name: 'idx_supplier_id' });
    await queryInterface.addIndex('purchase_orders', ['status'], { name: 'idx_status' });
    await queryInterface.addIndex('purchase_orders', ['order_date'], { name: 'idx_order_date' });
    await queryInterface.addIndex('purchase_orders', ['status', 'order_date'], { name: 'idx_po_status_date' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('purchase_orders');
  }
};

