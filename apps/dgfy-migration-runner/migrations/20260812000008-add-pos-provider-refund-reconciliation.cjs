'use strict';

const columnExists = async (queryInterface, tableName, columnName) => {
    try {
        const description = await queryInterface.describeTable(tableName);
        return Boolean(description?.[columnName]);
    } catch (error) {
        if (error?.original?.code === 'ER_NO_SUCH_TABLE' || error?.parent?.code === 'ER_NO_SUCH_TABLE') return false;
        throw error;
    }
};

const addColumnIfMissing = async (queryInterface, tableName, columnName, definition) => {
    if (!(await columnExists(queryInterface, tableName, columnName))) {
        await queryInterface.addColumn(tableName, columnName, definition);
    }
};

const indexExists = async (queryInterface, tableName, indexName) => {
    const indexes = await queryInterface.showIndex(tableName);
    return indexes.some((index) => index.name === indexName);
};

module.exports = {
    async up(queryInterface, Sequelize) {
        await addColumnIfMissing(queryInterface, 'pos_payment_allocations', 'provider_refund_ids', {
            type: Sequelize.JSON,
            allowNull: true,
            comment: 'Provider refund identities observed during reconciliation'
        });
        await addColumnIfMissing(queryInterface, 'pos_payment_allocations', 'provider_refund_event_id', {
            type: Sequelize.STRING(255),
            allowNull: true,
            comment: 'Stable provider refund event identity used for replay protection'
        });
        await addColumnIfMissing(queryInterface, 'pos_payment_allocations', 'provider_refund_status', {
            type: Sequelize.STRING(40),
            allowNull: true
        });
        await addColumnIfMissing(queryInterface, 'pos_payment_allocations', 'provider_refunded_at', {
            type: Sequelize.DATE,
            allowNull: true
        });
        if (!(await indexExists(queryInterface, 'pos_payment_allocations', 'uq_pos_payment_allocations_provider_refund_event_id'))) {
            await queryInterface.addIndex('pos_payment_allocations', ['provider_refund_event_id'], {
                name: 'uq_pos_payment_allocations_provider_refund_event_id',
                unique: true
            });
        }
    },

    async down(queryInterface) {
        if (await columnExists(queryInterface, 'pos_payment_allocations', 'provider_refund_event_id')
            && await indexExists(queryInterface, 'pos_payment_allocations', 'uq_pos_payment_allocations_provider_refund_event_id')) {
            await queryInterface.removeIndex('pos_payment_allocations', 'uq_pos_payment_allocations_provider_refund_event_id');
        }
        for (const columnName of ['provider_refunded_at', 'provider_refund_status', 'provider_refund_event_id', 'provider_refund_ids']) {
            if (await columnExists(queryInterface, 'pos_payment_allocations', columnName)) {
                await queryInterface.removeColumn('pos_payment_allocations', columnName);
            }
        }
    }
};
