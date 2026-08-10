export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('job_orders', {
      jo_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      jo_number: {
        type: Sequelize.STRING(50),
        unique: true,
        allowNull: false
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'items',
          key: 'item_id'
        }
      },
      quantity_to_produce: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('draft', 'in_progress', 'completed', 'cancelled'),
        defaultValue: 'draft'
      },
      created_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      completion_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      responsible_user: {
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

    await queryInterface.addIndex('job_orders', ['jo_number'], { name: 'idx_jo_number' });
    await queryInterface.addIndex('job_orders', ['product_id'], { name: 'idx_product_id' });
    await queryInterface.addIndex('job_orders', ['status'], { name: 'idx_status' });
    await queryInterface.addIndex('job_orders', ['created_date'], { name: 'idx_created_date' });
    await queryInterface.addIndex('job_orders', ['status', 'created_date'], { name: 'idx_jo_status_date' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('job_orders');
  }
};

