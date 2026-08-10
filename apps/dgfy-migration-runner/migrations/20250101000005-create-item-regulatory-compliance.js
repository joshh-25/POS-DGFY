export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('item_regulatory_compliance', {
      compliance_id: {
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
      fda_approved: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false
      },
      gmp_compliant: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false
      },
      haccp_plan: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false
      },
      organic_certified: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false
      },
      kosher_certified: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false
      },
      halal_certified: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false
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
      await queryInterface.addIndex('item_regulatory_compliance', ['item_id'], {
        name: 'idx_item_regulatory_compliance_item_id'
      });
    } catch (err) {
      if (err.original && err.original.code === 'ER_DUP_KEYNAME') {
        console.log('Index idx_item_regulatory_compliance_item_id already exists, skipping.');
      } else {
        console.log('Error adding index (likely exists):', err.message);
      }
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('item_regulatory_compliance');
  }
};
