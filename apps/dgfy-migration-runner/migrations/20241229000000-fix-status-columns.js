
export default {
    async up(queryInterface, Sequelize) {
        const transaction = await queryInterface.sequelize.transaction();

        try {
            // 1. Items: Convert is_active BOOLEAN to status ENUM
            // First add the new column
            await queryInterface.addColumn('items', 'status', {
                type: Sequelize.ENUM('draft', 'active', 'inactive'),
                defaultValue: 'active'
            }, { transaction });

            // Migrate data: is_active=1 -> status='active', is_active=0 -> status='inactive'
            await queryInterface.sequelize.query(
                `UPDATE items SET status = CASE WHEN is_active = 1 THEN 'active' ELSE 'inactive' END`,
                { transaction }
            );

            // Remove old column
            await queryInterface.removeColumn('items', 'is_active', { transaction });
            await queryInterface.removeIndex('items', 'idx_category_stock', { transaction }); // Remove compound index using is_active implicit/explicit? No, it used category and current_stock.
            // But verify if any index used is_active. 20240101000002-create-items.js didn't seemingly index is_active directly, but let's check.
            // Wait, 20240101000002-create-items.js DID NOT index is_active.
            // But let's check if we need to add index for status.
            await queryInterface.addIndex('items', ['status'], {
                name: 'idx_item_status',
                transaction
            });

            // 2. Suppliers: Convert is_active BOOLEAN to status ENUM
            await queryInterface.addColumn('suppliers', 'status', {
                type: Sequelize.ENUM('draft', 'active', 'inactive'),
                defaultValue: 'active'
            }, { transaction });

            await queryInterface.sequelize.query(
                `UPDATE suppliers SET status = CASE WHEN is_active = 1 THEN 'active' ELSE 'inactive' END`,
                { transaction }
            );

            await queryInterface.removeColumn('suppliers', 'is_active', { transaction });

            // Remove old index on is_active if it exists
            try {
                await queryInterface.removeIndex('suppliers', 'idx_is_active', { transaction });
            } catch (err) {
                // Index might not exist
            }

            await queryInterface.addIndex('suppliers', ['status'], {
                name: 'idx_supplier_status',
                transaction
            });

            // 3. Purchase Orders: Modify status ENUM to include 'draft'
            // MySQL doesn't support ALTER COLUMN TYPE for ENUM easily without raw query or full table copy
            // We will use raw query to modify the column type
            await queryInterface.sequelize.query(
                `ALTER TABLE purchase_orders MODIFY COLUMN status ENUM('draft', 'pending', 'partial', 'received', 'cancelled') DEFAULT 'draft'`,
                { transaction }
            );

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    },

    async down(queryInterface, Sequelize) {
        const transaction = await queryInterface.sequelize.transaction();

        try {
            // Revert Items
            await queryInterface.addColumn('items', 'is_active', {
                type: Sequelize.BOOLEAN,
                defaultValue: true
            }, { transaction });

            await queryInterface.sequelize.query(
                `UPDATE items SET is_active = CASE WHEN status = 'active' THEN 1 ELSE 0 END`,
                { transaction }
            );

            await queryInterface.removeColumn('items', 'status', { transaction });

            // Revert Suppliers
            await queryInterface.addColumn('suppliers', 'is_active', {
                type: Sequelize.BOOLEAN,
                defaultValue: true
            }, { transaction });

            await queryInterface.sequelize.query(
                `UPDATE suppliers SET is_active = CASE WHEN status = 'active' THEN 1 ELSE 0 END`,
                { transaction }
            );

            await queryInterface.removeColumn('suppliers', 'status', { transaction });
            await queryInterface.addIndex('suppliers', ['is_active'], { name: 'idx_is_active', transaction });

            // Revert Purchase Orders
            await queryInterface.sequelize.query(
                `UPDATE purchase_orders SET status = 'pending' WHERE status = 'draft'`,
                { transaction }
            );

            await queryInterface.sequelize.query(
                `ALTER TABLE purchase_orders MODIFY COLUMN status ENUM('pending', 'partial', 'received', 'cancelled') DEFAULT 'pending'`,
                { transaction }
            );

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }
};
