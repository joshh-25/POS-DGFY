'use strict';

// #448 (Phase 209): per-category affiliate commission rates. New dgfy_affiliate_category_rates
// table, scoped (tenant_id, enrollment_id, folder_id):
//   (a) folder_id is a TENANT-DB item_folders.folder_id, held BY VALUE - no cross-database FK,
//       the same convention dgfy_affiliate_price_rules.item_id and order_reference already use
//       elsewhere in this module (see 20260729000003-add-affiliate-price-rules.cjs's own header).
//   (b) enrollment_id = 0 is the tenant-wide template row, sentinel-0 rather than NULL because
//       MySQL treats NULL as distinct in a unique index (the same gotcha recorded at
//       20260729000003-add-affiliate-price-rules.cjs:14-19) - so `enrollment_id IS NULL` cannot
//       express "the template row" under a UNIQUE(tenant_id, enrollment_id, folder_id) index.
//   (c) there is deliberately NO folder_id = 0 "all categories" sentinel - "no row" already means
//       "use the tenant default" (tenant_affiliate_settings.default_rate_bps), and a folder_id = 0
//       row would just be a second, ambiguous spelling of the same value.
//   (d) the whole feature is inert unless tenant_affiliate_settings.category_rates_enabled is
//       true - see that column below. With the flag false (every existing tenant today), the
//       category-rate lookup is skipped entirely: zero added queries, and commission resolves
//       exactly as it did before this migration (Phase 208 behavior, unchanged).
//
// Idempotent throughout via describeTable/showIndex guards, mirroring
// 20260831000001-add-affiliate-earnings-cap.cjs and 20260729000003-add-affiliate-price-rules.cjs,
// so a re-run against an already-migrated database is a no-op.

const TABLE_CATEGORY_RATES = 'dgfy_affiliate_category_rates';
const TABLE_SETTINGS = 'tenant_affiliate_settings';

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

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
    const indexes = await queryInterface.showIndex(tableName).catch(() => []);
    if (indexes.some((index) => index.name === options.name)) return;
    await queryInterface.addIndex(tableName, fields, options);
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!(await tableExists(queryInterface, TABLE_SETTINGS))) {
            throw new Error(`Required landlord table is missing: ${TABLE_SETTINGS}`);
        }

        if (!(await tableExists(queryInterface, TABLE_CATEGORY_RATES))) {
            await queryInterface.createTable(TABLE_CATEGORY_RATES, {
                category_rate_id: {
                    type: Sequelize.INTEGER,
                    primaryKey: true,
                    autoIncrement: true,
                    allowNull: false
                },
                tenant_id: {
                    type: Sequelize.UUID,
                    allowNull: false
                },
                // 0 = tenant-wide template row (applies to every affiliate with no per-enrollment
                // override for this folder). A real enrollment_id scopes the rate to one affiliate.
                enrollment_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    defaultValue: 0
                },
                // A tenant-DB item_folders.folder_id, held by value - no cross-database FK. No
                // folder_id = 0 sentinel exists (see header note (c)); always a real folder id.
                folder_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false
                },
                // Basis points, same units as tenant_affiliate_settings.default_rate_bps. 0..10000.
                rate_bps: {
                    type: Sequelize.INTEGER,
                    allowNull: false
                },
                active: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: true
                },
                created_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                },
                updated_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                }
            });
        }
        await addIndexIfMissing(queryInterface, TABLE_CATEGORY_RATES, ['tenant_id', 'enrollment_id', 'folder_id'], {
            name: 'unique_dgfy_affiliate_category_rates_scope',
            unique: true
        });
        await addIndexIfMissing(queryInterface, TABLE_CATEGORY_RATES, ['tenant_id', 'active'], {
            name: 'idx_dgfy_affiliate_category_rates_tenant_active'
        });

        // #448 (Phase 209). When false (every existing tenant), the per-category rate lookup is
        // skipped entirely - zero added queries, and commission resolves exactly as it did in
        // Phase 208.
        await addColumnIfMissing(queryInterface, TABLE_SETTINGS, 'category_rates_enabled', {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        });
    },

    async down(queryInterface) {
        if (await tableExists(queryInterface, TABLE_SETTINGS)) {
            await removeColumnIfPresent(queryInterface, TABLE_SETTINGS, 'category_rates_enabled');
        }
        await queryInterface.removeIndex(TABLE_CATEGORY_RATES, 'idx_dgfy_affiliate_category_rates_tenant_active').catch(() => null);
        await queryInterface.removeIndex(TABLE_CATEGORY_RATES, 'unique_dgfy_affiliate_category_rates_scope').catch(() => null);
        await queryInterface.dropTable(TABLE_CATEGORY_RATES).catch(() => null);
    }
};
