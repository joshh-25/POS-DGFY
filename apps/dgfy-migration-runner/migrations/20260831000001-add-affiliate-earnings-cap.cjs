'use strict';

// #449 (Phase 208): affiliate lifetime earnings cap. Adds a tenant-wide default cap +
// end date to tenant_affiliate_settings, and a nullable per-enrollment override of the same
// pair to dgfy_affiliate_enrollments - mirroring the default_rate_bps / commission_rate_bps
// override convention. NULL on either cap column means "uncapped" / "inherit tenant default"
// respectively, so every existing tenant/enrollment resolves identically to today's behavior.
// Enforced at accrual time only - see affiliateCommissionAccrual.js. No index is added: the
// existing idx_dgfy_affiliate_commissions_enrollment_status already bounds the cap's lifetime
// SUM query to one affiliate's own rows.

const TABLE_SETTINGS = 'tenant_affiliate_settings';
const TABLE_ENROLLMENTS = 'dgfy_affiliate_enrollments';

const tableExists = async (queryInterface, tableName) => Boolean(
    await queryInterface.describeTable(tableName).catch(() => null)
);

const columnExists = async (queryInterface, tableName, columnName) => {
    const definition = await queryInterface.describeTable(tableName).catch(() => ({}));
    return Boolean(definition?.[columnName]);
};

const addColumnIfMissing = async (queryInterface, tableName, columnName, definition) => {
    if (!(await columnExists(queryInterface, tableName, columnName))) {
        await queryInterface.addColumn(tableName, columnName, definition);
    }
};

const removeColumnIfPresent = async (queryInterface, tableName, columnName) => {
    if (await columnExists(queryInterface, tableName, columnName)) {
        await queryInterface.removeColumn(tableName, columnName);
    }
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!(await tableExists(queryInterface, TABLE_SETTINGS))) {
            throw new Error(`Required landlord table is missing: ${TABLE_SETTINGS}`);
        }
        if (!(await tableExists(queryInterface, TABLE_ENROLLMENTS))) {
            throw new Error(`Required landlord table is missing: ${TABLE_ENROLLMENTS}`);
        }

        await addColumnIfMissing(queryInterface, TABLE_SETTINGS, 'max_lifetime_earnings_centavos', {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: 'Tenant-wide lifetime affiliate earnings cap in centavos. NULL = uncapped (today\'s behavior). Enforced at accrual time only - see #449 Phase 208.'
        });
        await addColumnIfMissing(queryInterface, TABLE_SETTINGS, 'earnings_cap_active_until', {
            type: Sequelize.DATE,
            allowNull: true,
            comment: 'The tenant cap applies only while this is NULL or in the future. Once passed the CAP stops applying (accrual continues, uncapped) - it is not a program expiry (#1206).'
        });

        await addColumnIfMissing(queryInterface, TABLE_ENROLLMENTS, 'max_lifetime_earnings_centavos', {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: 'Per-enrollment cap override. NULL = inherit the tenant default, same convention as commission_rate_bps.'
        });
        await addColumnIfMissing(queryInterface, TABLE_ENROLLMENTS, 'earnings_cap_active_until', {
            type: Sequelize.DATE,
            allowNull: true,
            comment: 'End date belonging to this enrollment\'s own cap; ignored unless max_lifetime_earnings_centavos is set on this row (#449 Phase 208).'
        });
    },

    async down(queryInterface) {
        if (await tableExists(queryInterface, TABLE_ENROLLMENTS)) {
            await removeColumnIfPresent(queryInterface, TABLE_ENROLLMENTS, 'earnings_cap_active_until');
            await removeColumnIfPresent(queryInterface, TABLE_ENROLLMENTS, 'max_lifetime_earnings_centavos');
        }
        if (await tableExists(queryInterface, TABLE_SETTINGS)) {
            await removeColumnIfPresent(queryInterface, TABLE_SETTINGS, 'earnings_cap_active_until');
            await removeColumnIfPresent(queryInterface, TABLE_SETTINGS, 'max_lifetime_earnings_centavos');
        }
    }
};
