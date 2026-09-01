'use strict';

// #450 (Phase 199) - the mechanical half only. Adds the revocation audit trail #450 names as
// missing; the four policy questions in that issue (commission-balance fate, in-flight
// attributions, re-invite, reversibility) are deliberately untouched.

const TABLE = 'dgfy_affiliate_enrollments';

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

        await addColumnIfMissing(queryInterface, 'revoked_at', {
            type: Sequelize.DATE,
            allowNull: true,
            comment: "When this enrollment was most recently moved into 'revoked' or 'suspended'. NULL = never. Not cleared on reactivation - audit trail, not a status mirror."
        });

        await addColumnIfMissing(queryInterface, 'revoked_by', {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: 'Tenant staff user who performed the most recent revocation or suspension (apps/dgfy-api/src/models/User.js, tenant-DB - value link only, no FK, cross-database).'
        });

        await addColumnIfMissing(queryInterface, 'revocation_reason', {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: 'Optional free-text reason supplied on the revoking/suspending PATCH. Matches dgfy_affiliate_cashouts.rejection_reason\'s width.'
        });
    },

    async down(queryInterface) {
        if (!(await tableExists(queryInterface))) return;
        if (await columnExists(queryInterface, 'revocation_reason')) {
            await queryInterface.removeColumn(TABLE, 'revocation_reason');
        }
        if (await columnExists(queryInterface, 'revoked_by')) {
            await queryInterface.removeColumn(TABLE, 'revoked_by');
        }
        if (await columnExists(queryInterface, 'revoked_at')) {
            await queryInterface.removeColumn(TABLE, 'revoked_at');
        }
    }
};
