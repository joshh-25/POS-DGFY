'use strict';

const describeTableSafe = async (queryInterface, tableName) => {
    try {
        return await queryInterface.describeTable(tableName);
    } catch (error) {
        if (error?.original?.code === 'ER_NO_SUCH_TABLE' || error?.parent?.code === 'ER_NO_SUCH_TABLE') return {};
        throw error;
    }
};
module.exports = {
    async up(queryInterface, Sequelize) {
        const adjustmentTable = await describeTableSafe(queryInterface, 'pos_transaction_adjustments');
        if (adjustmentTable.adjustment_type) {
            await queryInterface.changeColumn('pos_transaction_adjustments', 'adjustment_type', {
                type: Sequelize.ENUM(
                    'void',
                    'cash_refund',
                    'external_refund',
                    'provider_refund',
                    'employee_credit_reversal',
                    'return'
                ),
                allowNull: false
            });
        }

        const zReadingTable = await describeTableSafe(queryInterface, 'pos_z_reading_snapshots');
        if (zReadingTable.reading_payload_hash == null && Object.keys(zReadingTable).length > 0) {
            await queryInterface.addColumn('pos_z_reading_snapshots', 'reading_payload_hash', {
                type: Sequelize.STRING(64),
                allowNull: true,
                comment: 'SHA-256 of the immutable serialized X/Z reading payload'
            });
        }
    },

    async down(queryInterface, Sequelize) {
        const zReadingTable = await describeTableSafe(queryInterface, 'pos_z_reading_snapshots');
        if (zReadingTable.reading_payload_hash) {
            await queryInterface.removeColumn('pos_z_reading_snapshots', 'reading_payload_hash');
        }

        const adjustmentTable = await describeTableSafe(queryInterface, 'pos_transaction_adjustments');
        if (adjustmentTable.adjustment_type) {
            await queryInterface.changeColumn('pos_transaction_adjustments', 'adjustment_type', {
                type: Sequelize.ENUM(
                    'void',
                    'cash_refund',
                    'external_refund',
                    'provider_refund',
                    'employee_credit_reversal'
                ),
                allowNull: false
            });
        }
    }
};
