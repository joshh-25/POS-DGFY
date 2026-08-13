'use strict';

const TABLE = 'pos_parked_sales';
const COLUMN = 'revision';

const describeTable = async (queryInterface) => queryInterface.describeTable(TABLE).catch(() => null);

module.exports = {
    async up(queryInterface, Sequelize) {
        const table = await describeTable(queryInterface);
        if (!table || table[COLUMN]) return;
        await queryInterface.addColumn(TABLE, COLUMN, {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 1
        });
    },

    async down(queryInterface) {
        const table = await describeTable(queryInterface);
        if (table?.[COLUMN]) await queryInterface.removeColumn(TABLE, COLUMN);
    }
};
