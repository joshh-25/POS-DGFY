'use strict';

const TABLE = 'tenant_downpayment_settings';
const COLUMN = 'platform_downpayment_allowed';

module.exports = {
    async up(queryInterface, Sequelize) {
        const columns = await queryInterface.describeTable(TABLE);
        // A nullable intermediate column lets an interrupted MySQL DDL/backfill resume.
        // Once finalized, reruns must never re-enable an allowance an admin revoked.
        if (columns[COLUMN] && !columns[COLUMN].allowNull) return;
        if (!columns[COLUMN]) {
            await queryInterface.addColumn(TABLE, COLUMN, {
                type: Sequelize.BOOLEAN, allowNull: true, defaultValue: null
            });
        }
        await queryInterface.sequelize.query(
            `UPDATE ${TABLE} SET ${COLUMN} = (payment_mode <> 'full_payment') WHERE ${COLUMN} IS NULL`
        );
        await queryInterface.changeColumn(TABLE, COLUMN, {
            type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false
        });
    },
    async down(queryInterface) {
        const columns = await queryInterface.describeTable(TABLE);
        if (columns[COLUMN]) await queryInterface.removeColumn(TABLE, COLUMN);
    }
};
