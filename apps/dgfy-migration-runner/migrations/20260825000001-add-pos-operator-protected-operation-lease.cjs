'use strict';

const TABLE = 'pos_terminal_operator_sessions';
const INDEX = 'idx_pos_terminal_operator_sessions_protected_operation';

const normalizeTableName = (table) => typeof table === 'string'
    ? table
    : (table?.tableName || table?.TABLE_NAME || '');

const tableExists = async (queryInterface) => {
    const tables = await queryInterface.showAllTables();
    return tables.some((table) => normalizeTableName(table).toLowerCase() === TABLE);
};

const columnExists = async (queryInterface, columnName) => {
    const definition = await queryInterface.describeTable(TABLE).catch(() => ({}));
    return Boolean(definition?.[columnName]);
};

const indexExists = async (queryInterface) => {
    const indexes = await queryInterface.showIndex(TABLE).catch(() => []);
    return indexes.some((index) => index.name === INDEX);
};

const addColumnIfMissing = async (queryInterface, columnName, definition) => {
    if (!(await columnExists(queryInterface, columnName))) {
        await queryInterface.addColumn(TABLE, columnName, definition);
    }
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!(await tableExists(queryInterface))) {
            throw new Error(`Required POS operator table is missing: ${TABLE}`);
        }

        await addColumnIfMissing(queryInterface, 'protected_operation_key', {
            type: Sequelize.STRING(120),
            allowNull: true,
            comment: 'Request identity for a currently executing protected POS mutation'
        });
        await addColumnIfMissing(queryInterface, 'protected_operation_type', {
            type: Sequelize.STRING(120),
            allowNull: true
        });
        await addColumnIfMissing(queryInterface, 'protected_operation_started_at', {
            type: Sequelize.DATE,
            allowNull: true
        });
        if (!(await indexExists(queryInterface))) {
            await queryInterface.addIndex(TABLE, ['pos_terminal_shift_id', 'protected_operation_started_at'], {
                name: INDEX
            });
        }
    },

    async down(queryInterface) {
        if (!(await tableExists(queryInterface))) return;
        if (await indexExists(queryInterface)) await queryInterface.removeIndex(TABLE, INDEX);
        for (const columnName of [
            'protected_operation_started_at',
            'protected_operation_type',
            'protected_operation_key'
        ]) {
            if (await columnExists(queryInterface, columnName)) {
                await queryInterface.removeColumn(TABLE, columnName);
            }
        }
    }
};
