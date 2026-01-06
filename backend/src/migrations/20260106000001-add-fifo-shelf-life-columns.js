/**
 * Migration: Add FIFO Shelf Life Columns
 * Phase 18: Comprehensive FIFO & Shelf Life Enhancement
 * 
 * This migration adds:
 * - shelf_life_days and opened_shelf_life_days to items table
 * - expiry_date to po_line_items table (for receipt override)
 * - batch_id to jo_ingredients table (track consumed batch)
 * - batch_id and expiry_date to stock_movements table
 */

export default {
    async up(queryInterface, Sequelize) {
        // 1. Add shelf life columns to items table
        await queryInterface.addColumn('items', 'shelf_life_days', {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: 'Shelf life in days for unopened items (required if fifo_enabled)'
        });

        await queryInterface.addColumn('items', 'opened_shelf_life_days', {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: 'Shelf life in days after opening'
        });

        // 2. Add expiry_date to po_line_items for receipt override
        await queryInterface.addColumn('po_line_items', 'expiry_date', {
            type: Sequelize.DATEONLY,
            allowNull: true,
            comment: 'Optional expiry date override when receiving'
        });

        // 3. Add batch_id to jo_ingredients to track which batch was consumed
        await queryInterface.addColumn('jo_ingredients', 'batch_id', {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
                model: 'fifo_batches',
                key: 'batch_id'
            },
            comment: 'Reference to the FIFO batch that was consumed'
        });

        // 4. Add batch_id and expiry_date to stock_movements
        await queryInterface.addColumn('stock_movements', 'batch_id', {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
                model: 'fifo_batches',
                key: 'batch_id'
            },
            comment: 'Reference to the FIFO batch affected by this movement'
        });

        await queryInterface.addColumn('stock_movements', 'expiry_date', {
            type: Sequelize.DATEONLY,
            allowNull: true,
            comment: 'Expiry date for manual stock additions'
        });

        // Add index on stock_movements.batch_id for faster lookups
        await queryInterface.addIndex('stock_movements', ['batch_id'], {
            name: 'idx_stock_movements_batch_id'
        });

        // Add index on fifo_batches.expiry_date for expiry alerts
        await queryInterface.addIndex('fifo_batches', ['expiry_date'], {
            name: 'idx_fifo_batches_expiry_date'
        });
    },

    async down(queryInterface, Sequelize) {
        // Remove indexes first
        await queryInterface.removeIndex('stock_movements', 'idx_stock_movements_batch_id');
        await queryInterface.removeIndex('fifo_batches', 'idx_fifo_batches_expiry_date');

        // Remove columns in reverse order
        await queryInterface.removeColumn('stock_movements', 'expiry_date');
        await queryInterface.removeColumn('stock_movements', 'batch_id');
        await queryInterface.removeColumn('jo_ingredients', 'batch_id');
        await queryInterface.removeColumn('po_line_items', 'expiry_date');
        await queryInterface.removeColumn('items', 'opened_shelf_life_days');
        await queryInterface.removeColumn('items', 'shelf_life_days');
    }
};
