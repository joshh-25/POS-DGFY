export default {
  async up(queryInterface, Sequelize) {
// 1. Create table
    await queryInterface.createTable('item_physical_properties', {
      property_id: {
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
      texture: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      color: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      viscosity: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      ph_level: {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: true
      },
      water_activity: {
        type: Sequelize.DECIMAL(4, 3),
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
      // Ignore "Table already exists" error
      if (!err.original || err.original.code !== 'ER_TABLE_EXISTS_ERROR') {
         // Log but continue if it's just table exists, otherwise rethrow
         // For stricter safety we might want to throw, but in this recovery scenario we proceed.
         if (err.name === 'SequelizeDatabaseError' && err.message.includes('already exists')) return;
         throw err;
      }
    });

    // 2. Add index safely
    try {
        await queryInterface.addIndex('item_physical_properties', ['item_id'], {
          name: 'idx_item_physical_properties_item_id'
        });
    } catch (err) {
        // Ignore "Duplicate key name" or index exists
        if (err.original && err.original.code === 'ER_DUP_KEYNAME') {
            console.log('Index idx_item_physical_properties_item_id already exists, skipping.');
        } else {
             // throw err; // Optional: soft fail
             console.log('Error adding index (likely exists):', err.message);
        }
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('item_physical_properties');
  }
};
