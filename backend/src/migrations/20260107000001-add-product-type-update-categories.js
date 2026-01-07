/**
 * Migration: Add product_type field and update category ENUM
 * 
 * This migration:
 * 1. Adds product_type column
 * 2. Updates category ENUM to new values
 * 3. Migrates existing data
 * 4. Removes old category values
 */

export default {
    async up(queryInterface, Sequelize) {
        const transaction = await queryInterface.sequelize.transaction();

        try {
            console.log('🔄 Starting category migration...');

            // Step 1: Add product_type column
            console.log('  📝 Adding product_type column...');
            await queryInterface.addColumn('items', 'product_type', {
                type: Sequelize.ENUM('work_in_progress', 'finished_goods'),
                allowNull: true,
                after: 'category'
            }, { transaction });

            // Step 2: Modify category ENUM to include both old and new values temporarily
            console.log('  📝 Expanding category ENUM...');
            await queryInterface.sequelize.query(`
        ALTER TABLE items 
        MODIFY COLUMN category 
        ENUM('ingredient', 'product', 'packaging', 'raw_material', 'supplies') 
        NOT NULL
      `, { transaction });

            // Step 3: Migrate existing data
            console.log('  📝 Migrating existing data...');

            // Migrate 'ingredient' to 'raw_material'
            const [ingredientResults] = await queryInterface.sequelize.query(
                `UPDATE items SET category = 'raw_material' WHERE category = 'ingredient'`,
                { transaction }
            );
            console.log(`    ✅ Migrated ${ingredientResults.affectedRows || 0} ingredients to raw_material`);

            // Set product_type for existing products to 'finished_goods'
            const [productResults] = await queryInterface.sequelize.query(
                `UPDATE items SET product_type = 'finished_goods' WHERE category = 'product'`,
                { transaction }
            );
            console.log(`    ✅ Set product_type for ${productResults.affectedRows || 0} existing products`);

            // packaging stays as 'packaging' - no change needed

            // Step 4: Remove old category values from ENUM
            console.log('  📝 Finalizing category ENUM...');
            await queryInterface.sequelize.query(`
        ALTER TABLE items 
        MODIFY COLUMN category 
        ENUM('raw_material', 'packaging', 'product', 'supplies') 
        NOT NULL
      `, { transaction });

            // Step 5: Verify migration
            const [counts] = await queryInterface.sequelize.query(`
        SELECT 
          category,
          product_type,
          COUNT(*) as count
        FROM items
        GROUP BY category, product_type
      `, { transaction });

            console.log('  ✅ Migration complete! Category distribution:');
            counts.forEach(row => {
                const display = row.product_type
                    ? `${row.category} (${row.product_type})`
                    : row.category;
                console.log(`    - ${display}: ${row.count} items`);
            });

            await transaction.commit();
            console.log('✅ Category migration completed successfully');

        } catch (error) {
            await transaction.rollback();
            console.error('❌ Migration failed:', error.message);
            throw error;
        }
    },

    async down(queryInterface, Sequelize) {
        const transaction = await queryInterface.sequelize.transaction();

        try {
            console.log('🔄 Reverting category migration...');

            // Step 1: Expand ENUM to include old values
            await queryInterface.sequelize.query(`
        ALTER TABLE items 
        MODIFY COLUMN category 
        ENUM('ingredient', 'product', 'packaging', 'raw_material', 'supplies') 
        NOT NULL
      `, { transaction });

            // Step 2: Revert data migration
            await queryInterface.sequelize.query(
                `UPDATE items SET category = 'ingredient' WHERE category = 'raw_material'`,
                { transaction }
            );

            await queryInterface.sequelize.query(
                `UPDATE items SET product_type = NULL WHERE category = 'product'`,
                { transaction }
            );

            // Step 3: Restore original ENUM
            await queryInterface.sequelize.query(`
        ALTER TABLE items 
        MODIFY COLUMN category 
        ENUM('ingredient', 'product', 'packaging') 
        NOT NULL
      `, { transaction });

            // Step 4: Remove product_type column
            await queryInterface.removeColumn('items', 'product_type', { transaction });

            await transaction.commit();
            console.log('✅ Migration reverted successfully');

        } catch (error) {
            await transaction.rollback();
            console.error('❌ Revert failed:', error.message);
            throw error;
        }
    }
};
