'use strict';

const TABLE = 'pos_parked_sales';

const describeTable = async (queryInterface) => queryInterface.describeTable(TABLE).catch(() => null);

const hasIndex = async (queryInterface, indexName) => {
    const indexes = await queryInterface.showIndex(TABLE);
    return (indexes || []).some((index) => String(index?.name || '') === indexName);
};

const addIndexIfMissing = async (queryInterface, fields, name) => {
    if (await hasIndex(queryInterface, name)) return;
    await queryInterface.addIndex(TABLE, fields, { name });
};

const addColumnIfMissing = async (queryInterface, Sequelize, table, column, definition) => {
    const description = await queryInterface.describeTable(table).catch(() => null);
    if (!description || description[column]) return;
    await queryInterface.addColumn(table, column, definition);
};

module.exports = {
    async up(queryInterface, Sequelize) {
        const table = await describeTable(queryInterface);
        if (!table) return;

        await addColumnIfMissing(queryInterface, Sequelize, TABLE, 'origin_cashier_id', {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'users', key: 'user_id' },
            onUpdate: 'RESTRICT',
            onDelete: 'SET NULL'
        });
        await addColumnIfMissing(queryInterface, Sequelize, TABLE, 'origin_shift_id', {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'pos_terminal_shifts', key: 'pos_terminal_shift_id' },
            onUpdate: 'RESTRICT',
            onDelete: 'SET NULL'
        });

        await queryInterface.sequelize.query(
            `UPDATE ${TABLE}
             SET origin_cashier_id = COALESCE(origin_cashier_id, cashier_id),
                 origin_shift_id = COALESCE(origin_shift_id, shift_id)
             WHERE origin_cashier_id IS NULL OR origin_shift_id IS NULL`
        );

        const refreshed = await describeTable(queryInterface);
        if (refreshed?.origin_cashier_id && refreshed?.origin_shift_id) {
            await addIndexIfMissing(
                queryInterface,
                ['origin_cashier_id', 'status'],
                'idx_pos_parked_sales_origin_cashier_status'
            );
            await addIndexIfMissing(
                queryInterface,
                ['origin_shift_id', 'status'],
                'idx_pos_parked_sales_origin_shift_status'
            );
        }
    },

    async down(queryInterface) {
        const table = await describeTable(queryInterface);
        if (!table) return;
        if (table.origin_shift_id) await queryInterface.removeColumn(TABLE, 'origin_shift_id');
        if (table.origin_cashier_id) await queryInterface.removeColumn(TABLE, 'origin_cashier_id');
    }
};
