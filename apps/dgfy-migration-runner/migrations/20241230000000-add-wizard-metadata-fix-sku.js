export default {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // 1. Add wizard_metadata column (check if it exists first)
      const tableDescription = await queryInterface.describeTable('items');
      if (!tableDescription.wizard_metadata) {
        await queryInterface.addColumn('items', 'wizard_metadata', {
          type: Sequelize.JSON,
          allowNull: true,
          comment: 'Stores wizard progress and data for draft products'
        }, { transaction });
      } else {
        console.log('⚠️  wizard_metadata column already exists, skipping...');
      }

      // 2. Drop existing unique constraint on sku_code by removing the index
      await queryInterface.removeIndex('items', 'idx_sku_code', { transaction });

      // 3. Modify sku_code to allow NULL
      await queryInterface.changeColumn('items', 'sku_code', {
        type: Sequelize.STRING(50),
        allowNull: true,
        unique: false
      }, { transaction });

      // 4. Make category nullable for drafts
      await queryInterface.changeColumn('items', 'category', {
        type: Sequelize.ENUM('ingredient', 'product', 'packaging'),
        allowNull: true
      }, { transaction });

      // 5. Make max_capacity nullable for drafts
      await queryInterface.changeColumn('items', 'max_capacity', {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true
      }, { transaction });

      // 6. Make unit_of_measure nullable for drafts
      await queryInterface.changeColumn('items', 'unit_of_measure', {
        type: Sequelize.STRING(50),
        allowNull: true
      }, { transaction });

      // 7. Add non-unique index back on sku_code
      // (Application enforces uniqueness for non-draft items)
      await queryInterface.addIndex('items', ['sku_code'], {
        name: 'idx_sku_code',
        transaction
      });

      await transaction.commit();
      console.log('✅ Migration completed: Added wizard_metadata and made fields nullable for draft support');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Revert changes in reverse order

      // 1. Remove wizard_metadata column
      await queryInterface.removeColumn('items', 'wizard_metadata', { transaction });

      // 2. Remove non-unique index
      await queryInterface.removeIndex('items', 'idx_sku_code', { transaction });

      // 3. Restore sku_code to non-nullable with unique constraint
      await queryInterface.changeColumn('items', 'sku_code', {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      }, { transaction });

      // 4. Restore category to non-nullable
      await queryInterface.changeColumn('items', 'category', {
        type: Sequelize.ENUM('ingredient', 'product', 'packaging'),
        allowNull: false
      }, { transaction });

      // 5. Restore max_capacity to non-nullable
      await queryInterface.changeColumn('items', 'max_capacity', {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      }, { transaction });

      // 6. Restore unit_of_measure to non-nullable
      await queryInterface.changeColumn('items', 'unit_of_measure', {
        type: Sequelize.STRING(50),
        allowNull: false
      }, { transaction });

      // 7. Add unique index back on sku_code
      await queryInterface.addIndex('items', ['sku_code'], {
        name: 'idx_sku_code',
        unique: true,
        transaction
      });

      await transaction.commit();
      console.log('✅ Rollback completed: Reverted to original schema');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Rollback failed:', error.message);
      throw error;
    }
  }
};
