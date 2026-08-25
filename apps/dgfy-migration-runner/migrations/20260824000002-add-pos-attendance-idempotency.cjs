'use strict';

const TABLES = Object.freeze([
    'employee_attendance_sessions',
    'employee_break_segments'
]);

const normalizeTableName = (table) => typeof table === 'string'
    ? table
    : (table?.tableName || table?.TABLE_NAME || '');

const tableExists = async (queryInterface, tableName) => {
    const tables = await queryInterface.showAllTables();
    return tables.some((table) => normalizeTableName(table).toLowerCase() === tableName.toLowerCase());
};

const columnExists = async (queryInterface, tableName, columnName) => {
    const definition = await queryInterface.describeTable(tableName).catch(() => ({}));
    return Boolean(definition?.[columnName]);
};

const indexExists = async (queryInterface, tableName, indexName) => {
    const indexes = await queryInterface.showIndex(tableName).catch(() => []);
    return indexes.some((index) => index.name === indexName);
};

const addColumnIfMissing = async (queryInterface, tableName, columnName, definition) => {
    if (await columnExists(queryInterface, tableName, columnName)) return;
    await queryInterface.addColumn(tableName, columnName, definition);
};

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
    if (!(await indexExists(queryInterface, tableName, options.name))) {
        await queryInterface.addIndex(tableName, fields, options);
    }
};

const removeIndexIfPresent = async (queryInterface, tableName, indexName) => {
    if (await indexExists(queryInterface, tableName, indexName)) {
        await queryInterface.removeIndex(tableName, indexName);
    }
};

module.exports = {
    async up(queryInterface, Sequelize) {
        for (const tableName of TABLES) {
            if (!(await tableExists(queryInterface, tableName))) {
                throw new Error(`Required Phase 155 table is missing: ${tableName}`);
            }
        }

        await addColumnIfMissing(queryInterface, 'employee_attendance_sessions', 'start_idempotency_key', {
            type: Sequelize.STRING(120),
            allowNull: true
        });
        await addColumnIfMissing(queryInterface, 'employee_attendance_sessions', 'end_idempotency_key', {
            type: Sequelize.STRING(120),
            allowNull: true
        });
        await addIndexIfMissing(queryInterface, 'employee_attendance_sessions', ['user_id', 'start_idempotency_key'], {
            name: 'uq_employee_attendance_sessions_user_start_idempotency',
            unique: true
        });
        await addIndexIfMissing(queryInterface, 'employee_attendance_sessions', ['user_id', 'end_idempotency_key'], {
            name: 'uq_employee_attendance_sessions_user_end_idempotency',
            unique: true
        });

        await addColumnIfMissing(queryInterface, 'employee_break_segments', 'start_idempotency_key', {
            type: Sequelize.STRING(120),
            allowNull: true
        });
        await addColumnIfMissing(queryInterface, 'employee_break_segments', 'end_idempotency_key', {
            type: Sequelize.STRING(120),
            allowNull: true
        });
        await addIndexIfMissing(queryInterface, 'employee_break_segments', ['employee_attendance_session_id', 'start_idempotency_key'], {
            name: 'uq_employee_break_segments_session_start_idempotency',
            unique: true
        });
        await addIndexIfMissing(queryInterface, 'employee_break_segments', ['employee_attendance_session_id', 'end_idempotency_key'], {
            name: 'uq_employee_break_segments_session_end_idempotency',
            unique: true
        });
    },

    async down(queryInterface) {
        if (await tableExists(queryInterface, 'employee_break_segments')) {
            await removeIndexIfPresent(queryInterface, 'employee_break_segments', 'uq_employee_break_segments_session_end_idempotency');
            await removeIndexIfPresent(queryInterface, 'employee_break_segments', 'uq_employee_break_segments_session_start_idempotency');
            if (await columnExists(queryInterface, 'employee_break_segments', 'end_idempotency_key')) {
                await queryInterface.removeColumn('employee_break_segments', 'end_idempotency_key');
            }
            if (await columnExists(queryInterface, 'employee_break_segments', 'start_idempotency_key')) {
                await queryInterface.removeColumn('employee_break_segments', 'start_idempotency_key');
            }
        }
        if (await tableExists(queryInterface, 'employee_attendance_sessions')) {
            await removeIndexIfPresent(queryInterface, 'employee_attendance_sessions', 'uq_employee_attendance_sessions_user_end_idempotency');
            await removeIndexIfPresent(queryInterface, 'employee_attendance_sessions', 'uq_employee_attendance_sessions_user_start_idempotency');
            if (await columnExists(queryInterface, 'employee_attendance_sessions', 'end_idempotency_key')) {
                await queryInterface.removeColumn('employee_attendance_sessions', 'end_idempotency_key');
            }
            if (await columnExists(queryInterface, 'employee_attendance_sessions', 'start_idempotency_key')) {
                await queryInterface.removeColumn('employee_attendance_sessions', 'start_idempotency_key');
            }
        }
    }
};
