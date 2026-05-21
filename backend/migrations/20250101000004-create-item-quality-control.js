export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('item_quality_control', {
      qc_id: {
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
      test_frequency: {
        type: Sequelize.ENUM('every_batch', 'daily', 'weekly', 'bi_weekly', 'monthly', 'quarterly'),
        allowNull: true
      },
      sampling_plan: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      acceptance_criteria: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      corrective_actions: {
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
    }).catch(err => {
      if (!err.original || err.original.code !== 'ER_TABLE_EXISTS_ERROR') {
        if (err.name === 'SequelizeDatabaseError' && err.message.includes('already exists')) return;
        throw err;
      }
    });

    try {
      await queryInterface.addIndex('item_quality_control', ['item_id'], {
        name: 'idx_item_quality_control_item_id'
      });
    } catch (err) {
      if (err.original && err.original.code === 'ER_DUP_KEYNAME') {
        console.log('Index idx_item_quality_control_item_id already exists, skipping.');
      } else {
        console.log('Error adding index (likely exists):', err.message);
      }
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('item_quality_control');
  }
};
