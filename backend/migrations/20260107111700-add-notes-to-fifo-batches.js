/**
 * Migration: Add Notes Column to FIFO Batches
 * Phase 22: JO Notes & FIFO Batch Notes Feature
 *
 * This migration adds:
 * - notes column to fifo_batches table
 */

export default {
    async up(queryInterface, Sequelize) {
        // Check if column already exists to make migration idempotent
        await queryInterface.addColumn('fifo_batches', 'notes', {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: 'Notes from PO receipt or JO completion'
        }).catch(err => {
            if (err.original && err.original.code === 'ER_DUP_FIELDNAME') return;
            throw err;
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('fifo_batches', 'notes');
    }
};
