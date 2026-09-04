'use strict';

const tableExists = async (queryInterface, tableName) => {
    const tables = await queryInterface.showAllTables();
    return tables.some((table) => String(table?.tableName || table?.TABLE_NAME || table).toLowerCase() === tableName.toLowerCase());
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
    if (await tableExists(queryInterface, tableName) && !(await columnExists(queryInterface, tableName, columnName))) {
        await queryInterface.addColumn(tableName, columnName, definition);
    }
};

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
    if (await tableExists(queryInterface, tableName) && !(await indexExists(queryInterface, tableName, options.name))) {
        await queryInterface.addIndex(tableName, fields, options);
    }
};

module.exports = {
    async up(queryInterface, Sequelize) {
        await addColumnIfMissing(queryInterface, 'users', 'pos_cashier_pin_hash', {
            type: Sequelize.STRING(255),
            allowNull: true,
            comment: 'Dedicated POS cashier takeover PIN bcrypt hash'
        });
        await addColumnIfMissing(queryInterface, 'users', 'pos_cashier_pin_failed_attempts', {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: 'Failed dedicated cashier PIN attempts since last successful verification'
        });
        await addColumnIfMissing(queryInterface, 'users', 'pos_cashier_pin_locked_until', {
            type: Sequelize.DATE,
            allowNull: true,
            comment: 'Dedicated cashier PIN lockout expiry'
        });
        await addColumnIfMissing(queryInterface, 'users', 'pos_cashier_pin_changed_at', {
            type: Sequelize.DATE,
            allowNull: true,
            comment: 'Dedicated cashier PIN last enrollment/reset timestamp'
        });

        await addColumnIfMissing(queryInterface, 'pos_terminal_operator_sessions', 'authority_token_hash', {
            type: Sequelize.STRING(64),
            allowNull: true,
            comment: 'SHA-256 hash of the short-lived HttpOnly operator authority token'
        });
        await addColumnIfMissing(queryInterface, 'pos_terminal_operator_sessions', 'authority_expires_at', {
            type: Sequelize.DATE,
            allowNull: true
        });
        await addColumnIfMissing(queryInterface, 'pos_terminal_operator_sessions', 'revoked_at', {
            type: Sequelize.DATE,
            allowNull: true
        });
        await addColumnIfMissing(queryInterface, 'pos_terminal_operator_sessions', 'revoked_reason', {
            type: Sequelize.STRING(80),
            allowNull: true
        });
        await addColumnIfMissing(queryInterface, 'pos_terminal_operator_sessions', 'idempotency_key', {
            type: Sequelize.STRING(120),
            allowNull: true
        });
        await addIndexIfMissing(queryInterface, 'pos_terminal_operator_sessions', ['authority_token_hash'], {
            name: 'idx_pos_terminal_operator_sessions_authority_token_hash'
        });
        await addIndexIfMissing(queryInterface, 'pos_terminal_operator_sessions', ['pos_terminal_shift_id', 'idempotency_key'], {
            name: 'uq_pos_terminal_operator_sessions_shift_idempotency',
            unique: true
        });
    },

    async down(queryInterface) {
        if (await tableExists(queryInterface, 'pos_terminal_operator_sessions')) {
            for (const indexName of [
                'uq_pos_terminal_operator_sessions_shift_idempotency',
                'idx_pos_terminal_operator_sessions_authority_token_hash'
            ]) {
                if (await indexExists(queryInterface, 'pos_terminal_operator_sessions', indexName)) {
                    await queryInterface.removeIndex('pos_terminal_operator_sessions', indexName);
                }
            }
            for (const columnName of [
                'idempotency_key',
                'revoked_reason',
                'revoked_at',
                'authority_expires_at',
                'authority_token_hash'
            ]) {
                if (await columnExists(queryInterface, 'pos_terminal_operator_sessions', columnName)) {
                    await queryInterface.removeColumn('pos_terminal_operator_sessions', columnName);
                }
            }
        }
        if (await tableExists(queryInterface, 'users')) {
            for (const columnName of [
                'pos_cashier_pin_changed_at',
                'pos_cashier_pin_locked_until',
                'pos_cashier_pin_failed_attempts',
                'pos_cashier_pin_hash'
            ]) {
                if (await columnExists(queryInterface, 'users', columnName)) {
                    await queryInterface.removeColumn('users', columnName);
                }
            }
        }
    }
};
