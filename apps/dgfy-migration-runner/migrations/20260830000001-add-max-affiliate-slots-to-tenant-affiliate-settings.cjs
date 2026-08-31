'use strict';

// #1177 (Phase 198, per #447 D1-D6): "one affiliate per store" becomes a code-enforced,
// per-tenant configurable cap rather than an unenforced business-policy convention. Adds
// max_affiliate_slots to the landlord tenant_affiliate_settings table - defaults to 1 so every
// existing tenant (row or no row) starts at the current de facto behavior. Raising the cap is a
// manual/out-of-band admin action (#447 D5) - no self-serve purchase path in this phase.

const TABLE = 'tenant_affiliate_settings';

const tableExists = async (queryInterface) => Boolean(
    await queryInterface.describeTable(TABLE).catch(() => null)
);

const columnExists = async (queryInterface, columnName) => {
    const definition = await queryInterface.describeTable(TABLE).catch(() => ({}));
    return Boolean(definition?.[columnName]);
};

const addColumnIfMissing = async (queryInterface, columnName, definition) => {
    if (!(await columnExists(queryInterface, columnName))) {
        await queryInterface.addColumn(TABLE, columnName, definition);
    }
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!(await tableExists(queryInterface))) {
            throw new Error(`Required landlord table is missing: ${TABLE}`);
        }

        await addColumnIfMissing(queryInterface, 'max_affiliate_slots', {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 1,
            comment: 'Max concurrently-consumed affiliate slots for this tenant (active enrollments + pending, non-expired invites). Raised only by internal admin action - see #447 D5.'
        });
    },

    async down(queryInterface) {
        if (!(await tableExists(queryInterface))) return;
        if (await columnExists(queryInterface, 'max_affiliate_slots')) {
            await queryInterface.removeColumn(TABLE, 'max_affiliate_slots');
        }
    }
};
