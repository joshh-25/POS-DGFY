'use strict';

// #713 (epic #453). Adds a public-listing flag independent of `channels_mask` -- settled 2026-08-20
// during the voucher/promo notes session: `channels_mask` controls where a voucher CODE is usable
// (storefront/POS), `is_publicly_listed` controls whether the voucher is ADVERTISED on the public
// storefront discovery page. A B2B pricelist voucher (#696) wants POS-usable + unadvertised;
// today's promo engine has no such distinction -- every active promo is always advertised. Default
// `false` because there is no existing "usable but unadvertised" concept for this column to
// preserve; #695's migration sets it `true` on every migrated promo specifically to preserve that
// engine's always-advertised behavior.

const normalizeTableName = (table) => {
    if (!table) return '';
    if (typeof table === 'string') return table;
    if (typeof table === 'object') return table.tableName || table.TABLE_NAME || '';
    return '';
};

const tableExists = async (queryInterface, tableName) => {
    const tables = await queryInterface.showAllTables();
    return tables.some((table) => normalizeTableName(table).toLowerCase() === tableName.toLowerCase());
};

const columnExists = async (queryInterface, tableName, columnName) => {
    const description = await queryInterface.describeTable(tableName);
    return Object.prototype.hasOwnProperty.call(description, columnName);
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!(await tableExists(queryInterface, 'vouchers'))) {
            return;
        }
        if (await columnExists(queryInterface, 'vouchers', 'is_publicly_listed')) {
            return;
        }
        await queryInterface.addColumn('vouchers', 'is_publicly_listed', {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        });
    },

    async down(queryInterface) {
        if (await columnExists(queryInterface, 'vouchers', 'is_publicly_listed')) {
            await queryInterface.removeColumn('vouchers', 'is_publicly_listed');
        }
    }
};
