'use strict';

const USER_TABLE = 'users';
const Z_READING_TABLE = 'pos_z_reading_snapshots';
const CLOSED_BY_INDEX = 'idx_pos_z_reading_snapshots_closed_by_user';

const tableExists = async (queryInterface, tableName) => Boolean(
    await queryInterface.describeTable(tableName).catch(() => null)
);

const columnExists = async (queryInterface, tableName, columnName) => {
    const table = await queryInterface.describeTable(tableName).catch(() => null);
    return Boolean(table?.[columnName]);
};

const indexExists = async (queryInterface, tableName, indexName) => {
    const indexes = await queryInterface.showIndex(tableName).catch(() => []);
    return indexes.some((index) => index.name === indexName);
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (await tableExists(queryInterface, USER_TABLE)
            && !(await columnExists(queryInterface, USER_TABLE, 'pos_day_close_pin_hash'))) {
            await queryInterface.addColumn(USER_TABLE, 'pos_day_close_pin_hash', {
                type: Sequelize.STRING(255),
                allowNull: true
            });
        }

        if (!(await tableExists(queryInterface, Z_READING_TABLE))) return;

        if (!(await columnExists(queryInterface, Z_READING_TABLE, 'closed_by_user_id'))) {
            await queryInterface.addColumn(Z_READING_TABLE, 'closed_by_user_id', {
                type: Sequelize.INTEGER,
                allowNull: true
            });
        }
        if (!(await columnExists(queryInterface, Z_READING_TABLE, 'closed_from_terminal_id'))) {
            await queryInterface.addColumn(Z_READING_TABLE, 'closed_from_terminal_id', {
                type: Sequelize.STRING(100),
                allowNull: true
            });
        }
        if (!(await columnExists(queryInterface, Z_READING_TABLE, 'day_close_pin_confirmed_at'))) {
            await queryInterface.addColumn(Z_READING_TABLE, 'day_close_pin_confirmed_at', {
                type: Sequelize.DATE,
                allowNull: true
            });
        }
        if (!(await indexExists(queryInterface, Z_READING_TABLE, CLOSED_BY_INDEX))) {
            await queryInterface.addIndex(Z_READING_TABLE, ['closed_by_user_id'], {
                name: CLOSED_BY_INDEX
            });
        }
    },

    async down(queryInterface) {
        if (await tableExists(queryInterface, Z_READING_TABLE)) {
            if (await indexExists(queryInterface, Z_READING_TABLE, CLOSED_BY_INDEX)) {
                await queryInterface.removeIndex(Z_READING_TABLE, CLOSED_BY_INDEX);
            }
            for (const columnName of ['day_close_pin_confirmed_at', 'closed_from_terminal_id', 'closed_by_user_id']) {
                if (await columnExists(queryInterface, Z_READING_TABLE, columnName)) {
                    await queryInterface.removeColumn(Z_READING_TABLE, columnName);
                }
            }
        }
        if (await tableExists(queryInterface, USER_TABLE)
            && await columnExists(queryInterface, USER_TABLE, 'pos_day_close_pin_hash')) {
            await queryInterface.removeColumn(USER_TABLE, 'pos_day_close_pin_hash');
        }
    }
};
