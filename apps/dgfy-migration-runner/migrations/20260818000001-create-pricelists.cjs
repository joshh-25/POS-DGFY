'use strict';

// Phase 111 of issue #696 (epic #453), extending #584/ADR 0066. A `fixed_price` voucher today
// carries ONE pinned price for every scoped item (`vouchers.fixed_unit_price_centavos`). This adds
// a per-item pricelist a voucher can carry instead -- N prices for N items, the wholesale/B2B-via-
// B2C shape #454 decision 2 already accepts.
//
// Two tables, one FK cluster with `vouchers` (an added column, not a new table on that side), so
// they land in one migration -- same rationale `20260817000001-create-vouchers.cjs` gives for its
// own four-table bundle. Created in FK-dependency order: pricelists, pricelist_items, then the
// `vouchers.pricelist_id` column addition (pricelists must exist first for that FK to attach).
//
// Draft -> publish (#698) works by swapping `pricelist_items` rows inside a transaction, never by
// moving `vouchers.pricelist_id` to a different pricelist row -- so no id churn, no voucher FK
// rewrite, and a buyer mid-checkout never sees prices shift.
//
// ADR 0066 decision 1 [binding] is untouched by this migration: nothing here writes a persisted
// unit price anywhere. `pricelist_items.unit_price_centavos` is intent, exactly like
// `vouchers.fixed_unit_price_centavos` already is -- resolved into an order-level discount at
// redemption, never written back to `items.default_sale_price`.

const PRICELIST_STATUS_VALUES = ['draft', 'active', 'archived'];

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

const createPricelists = async (queryInterface, Sequelize) => {
    if (await tableExists(queryInterface, 'pricelists')) {
        return;
    }

    await queryInterface.createTable('pricelists', {
        pricelist_id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        name: {
            type: Sequelize.STRING(120),
            allowNull: false
        },
        description: {
            type: Sequelize.STRING(255),
            allowNull: true
        },
        status: {
            type: Sequelize.ENUM(...PRICELIST_STATUS_VALUES),
            allowNull: false,
            defaultValue: 'draft'
        },
        // Self-referential: a non-null value marks THIS row as the open draft revision of the
        // referenced published pricelist (#698's draft-revision -> publish cycle). Publish swaps
        // `pricelist_items` from the draft into the published row inside one transaction, then
        // deletes the draft -- the published row's own `pricelist_id` never changes, so
        // `vouchers.pricelist_id` never needs rewriting.
        draft_of_pricelist_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'pricelists', key: 'pricelist_id' },
            onUpdate: 'RESTRICT',
            onDelete: 'CASCADE'
        },
        // Manual optimistic locking, same convention as vouchers.version -- incremented explicitly
        // by the use-case layer, not Sequelize's built-in `version: true`.
        version: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        }
    });

    // Drives "which pricelists are attachable right now" without a table scan.
    await queryInterface.addIndex('pricelists', ['status'], {
        name: 'idx_pricelists_status'
    });
    // At most one open draft per published pricelist.
    await queryInterface.addIndex('pricelists', ['draft_of_pricelist_id'], {
        name: 'uq_pricelists_draft_of',
        unique: true
    });
};

const createPricelistItems = async (queryInterface, Sequelize) => {
    if (await tableExists(queryInterface, 'pricelist_items')) {
        return;
    }

    await queryInterface.createTable('pricelist_items', {
        pricelist_item_id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        pricelist_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'pricelists', key: 'pricelist_id' },
            onUpdate: 'RESTRICT',
            onDelete: 'CASCADE'
        },
        item_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'items', key: 'item_id' },
            onUpdate: 'RESTRICT',
            onDelete: 'RESTRICT'
        },
        // Intent, not a delta -- same reasoning as vouchers.fixed_unit_price_centavos (ADR 0066
        // decision 5): Item.default_sale_price moves with Dispatch Order dispatches, so a stored
        // delta would silently drift. BIGINT: a price in centavos overflows INT at ~21.5M pesos,
        // matching every other centavos column in this initiative.
        unit_price_centavos: {
            type: Sequelize.BIGINT,
            allowNull: false
        },
        // Distinguishes a deliberately-typed price from #698's SRP prefill. Load-bearing, not
        // bookkeeping: without it there is no way to tell an untouched row (which will drift as
        // Item.default_sale_price moves) from one the merchant actually priced.
        is_manual_override: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        }
    });

    await queryInterface.addIndex('pricelist_items', ['pricelist_id', 'item_id'], {
        name: 'uq_pricelist_items_pricelist_item',
        unique: true
    });
    // This one exists only so MySQL does not auto-create its own FK-backing index under a
    // column-derived name -- same reasoning voucher_redemptions gives for its own location/cashier
    // indexes. Naming it keeps the emitted schema predictable for the tenant-repair registry.
    await queryInterface.addIndex('pricelist_items', ['item_id'], {
        name: 'idx_pricelist_items_item'
    });
};

const addVoucherPricelistColumn = async (queryInterface, Sequelize) => {
    if (await columnExists(queryInterface, 'vouchers', 'pricelist_id')) {
        return;
    }

    // Nullable: a fixed_price voucher carries EITHER fixed_unit_price_centavos (the existing single
    // price, unchanged) OR pricelist_id, never both -- enforced in voucherUseCases.js's
    // applyBenefitConfig, not the schema. ON DELETE RESTRICT: a pricelist in use by a voucher must
    // not vanish out from under it.
    await queryInterface.addColumn('vouchers', 'pricelist_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'pricelists', key: 'pricelist_id' },
        onUpdate: 'RESTRICT',
        onDelete: 'RESTRICT'
    });
    await queryInterface.addIndex('vouchers', ['pricelist_id'], {
        name: 'idx_vouchers_pricelist'
    });
};

module.exports = {
    async up(queryInterface, Sequelize) {
        await createPricelists(queryInterface, Sequelize);
        await createPricelistItems(queryInterface, Sequelize);
        await addVoucherPricelistColumn(queryInterface, Sequelize);
    },

    async down(queryInterface) {
        if (await columnExists(queryInterface, 'vouchers', 'pricelist_id')) {
            await queryInterface.removeColumn('vouchers', 'pricelist_id');
        }
        // Reverse dependency order.
        for (const tableName of ['pricelist_items', 'pricelists']) {
            if (await tableExists(queryInterface, tableName)) {
                await queryInterface.dropTable(tableName);
            }
        }
    }
};
