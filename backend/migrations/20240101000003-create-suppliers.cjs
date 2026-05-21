/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const existingTables = await queryInterface.showAllTables();
    const hasSuppliersTable = existingTables.some((table) => (
      String(table).toLowerCase() === 'suppliers'
    ));

    const columns = {
      supplier_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      contact_person: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      email: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      phone: {
        type: Sequelize.STRING(20),
        allowNull: true
      },
      address: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      quality_rating: {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: true
      },
      avg_delivery_days: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      last_delivery_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
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
    };

    if (!hasSuppliersTable) {
      await queryInterface.createTable('suppliers', {
        ...columns
      });
    } else {
      const existingColumns = await queryInterface.describeTable('suppliers');
      for (const [columnName, definition] of Object.entries(columns)) {
        if (!existingColumns[columnName]) {
          await queryInterface.addColumn('suppliers', columnName, definition);
        }
      }
    }

    const existingIndexes = await queryInterface.showIndex('suppliers');
    const existingIndexNames = new Set(existingIndexes.map((index) => index.name));
    const ensureIndex = async (fields, name) => {
      if (!existingIndexNames.has(name)) {
        await queryInterface.addIndex('suppliers', fields, { name });
      }
    };

    await ensureIndex(['name'], 'idx_supplier_name');
    await ensureIndex(['email'], 'idx_supplier_email');
    await ensureIndex(['is_active'], 'idx_supplier_is_active');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('suppliers');
  }
};
