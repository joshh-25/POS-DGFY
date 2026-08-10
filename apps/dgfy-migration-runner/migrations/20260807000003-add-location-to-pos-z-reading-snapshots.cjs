'use strict';

const TABLE_NAME = 'pos_z_reading_snapshots';
const LOCATION_INDEX_NAME = 'uq_pos_z_reading_snapshots_business_date_location';

const tableExists = async (queryInterface, tableName) => {
    const table = await queryInterface.describeTable(tableName).catch(() => null);
    return Boolean(table);
};

const columnExists = async (queryInterface, tableName, columnName) => {
    const table = await queryInterface.describeTable(tableName).catch(() => null);
    return Boolean(table && table[columnName]);
};

const indexExists = async (queryInterface, tableName, indexName) => {
    const indexes = await queryInterface.showIndex(tableName).catch(() => []);
    return indexes.some((index) => index.name === indexName);
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!(await tableExists(queryInterface, TABLE_NAME))) return;

        if (!(await columnExists(queryInterface, TABLE_NAME, 'location_id'))) {
            await queryInterface.addColumn(TABLE_NAME, 'location_id', {
                type: Sequelize.INTEGER,
                allowNull: true
            });
        }

        if (!(await indexExists(queryInterface, TABLE_NAME, LOCATION_INDEX_NAME))) {
            await queryInterface.addIndex(TABLE_NAME, ['business_date', 'location_id'], {
                name: LOCATION_INDEX_NAME,
                unique: true
            });
        }
    },

    async down(queryInterface) {
        if (!(await tableExists(queryInterface, TABLE_NAME))) return;

        if (await indexExists(queryInterface, TABLE_NAME, LOCATION_INDEX_NAME)) {
            await queryInterface.removeIndex(TABLE_NAME, LOCATION_INDEX_NAME);
        }

        if (await columnExists(queryInterface, TABLE_NAME, 'location_id')) {
            await queryInterface.removeColumn(TABLE_NAME, 'location_id');
        }
    }
};
