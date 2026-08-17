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
        await addColumnIfMissing(queryInterface, 'pos_transactions', 'payment_breakdown', {
            type: Sequelize.JSON,
            allowNull: true,
            comment: 'Immutable successful tender allocation snapshot for receipts and reports'
        });

        await addColumnIfMissing(queryInterface, 'pos_payment_allocations', 'provider_event_id', {
            type: Sequelize.STRING(120),
            allowNull: true,
            comment: 'Provider event identity accepted by the server-side confirmation verifier'
        });
        if (!(await indexExists(queryInterface, 'pos_payment_allocations', 'uq_pos_payment_allocations_provider_event_id'))) {
            await queryInterface.addIndex('pos_payment_allocations', ['provider_event_id'], {
                name: 'uq_pos_payment_allocations_provider_event_id',
                unique: true
            });
        }
    },

    async down(queryInterface) {
        if (await columnExists(queryInterface, 'pos_payment_allocations', 'provider_event_id')) {
            if (await indexExists(queryInterface, 'pos_payment_allocations', 'uq_pos_payment_allocations_provider_event_id')) {
                await queryInterface.removeIndex('pos_payment_allocations', 'uq_pos_payment_allocations_provider_event_id');
            }
            await queryInterface.removeColumn('pos_payment_allocations', 'provider_event_id');
        }
        if (await columnExists(queryInterface, 'pos_transactions', 'payment_breakdown')) {
            await queryInterface.removeColumn('pos_transactions', 'payment_breakdown');
        }
    }
};
