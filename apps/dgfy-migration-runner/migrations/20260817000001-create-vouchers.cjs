'use strict';

// Phase 102 of issue #455 (epic #453), authorized by ADR 0066 (voucher sale-time price
// resolution), which is itself required because ADR 0029 Decision 2 is binding that Catalog owns
// base sale price and a voucher fixed price is a sale-time layer above it.
//
// Four tables in one migration because they are one FK cluster; splitting them only makes the
// tableExists() guard logic worse. Created in FK-dependency order, dropped in reverse.
//
// Shape follows EmployeeCreditAccount + EmployeeCreditLedgerEntry (apps/dgfy-api/src/models/):
// an account/ledger split where `vouchers.redeemed_*` are a derived cache of
// `voucher_redemptions`, kept in sync by a single atomic conditional UPDATE at redemption time and
// never trusted as the source of truth (ADR 0066 decision 4).
//
// Three deviations from #455's written schema, all verified against the code:
//
//   1. `location_id` references `tenant_locations(location_id)`. #455 says "locations"; no such
//      table exists anywhere in the tenant schema.
//   2. `voucher_scopes.scope_ref_id` carries NO foreign key. It is polymorphic across
//      `items(item_id)` and `item_folders(folder_id)` depending on `scope_type`, so a real FK is
//      impossible; the reference is validated in the repository instead. #455 lists it among "every
//      FK the ledger needs" -- it isn't one.
//   3. Eligibility is stored as TINYINT UNSIGNED bitmasks, not MySQL SET. #455 specifies
//      `SET NOT NULL`, but `DataTypes.SET` does not exist in Sequelize 6.37.8 (verified: it is
//      `undefined`), so a SET column cannot be expressed in the model layer at all -- and
//      `sequelize.sync()` over those models is how new tenants are provisioned
//      (tenantProvisioningService.js). A bitmask keeps the property that actually matters per ADR
//      0066 decision 10 -- NOT NULL with an explicit default, so "eligible everywhere" is
//      unrepresentable rather than the accidental default that produced #459 -- while matching the
//      `weekday_mask` encoding #455 already mandates on this same table.
//
// Money is integer centavos throughout (ADR 0066 decision 2), never the round4 pesos the promo
// path uses. Cumulative money columns are BIGINT: a campaign budget in centavos overflows INT at
// only ~21.5M pesos.

const VOUCHER_KIND_VALUES = ['promo_code'];
const BENEFIT_CLASS_VALUES = ['percent_off', 'amount_off', 'fixed_price'];
const VOUCHER_STATUS_VALUES = ['draft', 'active', 'paused', 'expired', 'archived'];
const SCOPE_TYPE_VALUES = ['item', 'item_folder'];
const ENTRY_TYPE_VALUES = ['redemption', 'reversal', 'adjustment'];
const CHANNEL_VALUES = ['storefront', 'pos'];

// Bit positions, mirrored in apps/dgfy-api/src/modules/vouchers/domain/ (Phase 103).
// channels:            storefront=1, pos=2                  -> default 1  (storefront only, #455)
// fulfillment_methods: delivery=1,   pickup=2                -> default 3  (unconstrained)
// order_timings:       asap=1,       scheduled=2             -> default 3  (unconstrained)
// weekday_mask:        Sun=1 .. Sat=64                       -> default 127 (every day)
const CHANNELS_MASK_DEFAULT = 1;
const FULFILLMENT_METHODS_MASK_DEFAULT = 3;
const ORDER_TIMINGS_MASK_DEFAULT = 3;
const WEEKDAY_MASK_DEFAULT = 127;

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

const createVouchers = async (queryInterface, Sequelize) => {
    if (await tableExists(queryInterface, 'vouchers')) {
        return;
    }

    await queryInterface.createTable('vouchers', {
        voucher_id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        code: {
            type: Sequelize.STRING(64),
            allowNull: false
        },
        voucher_kind: {
            type: Sequelize.ENUM(...VOUCHER_KIND_VALUES),
            allowNull: false,
            defaultValue: 'promo_code'
        },

        // Display fields. Not in #455's column list, but a voucher with no name is unusable in the
        // authoring UI (#614), and these four are exactly what a `storefront_promos` entry carries
        // today -- without them the Phase 107 migration is lossy.
        title: {
            type: Sequelize.STRING(255),
            allowNull: false
        },
        subtitle: {
            type: Sequelize.STRING(255),
            allowNull: true
        },
        badge: {
            type: Sequelize.STRING(80),
            allowNull: true
        },
        validity_text: {
            type: Sequelize.STRING(255),
            allowNull: true
        },

        benefit_class: {
            type: Sequelize.ENUM(...BENEFIT_CLASS_VALUES),
            allowNull: false
        },
        percent_off_bps: {
            type: Sequelize.INTEGER,
            allowNull: true
        },
        amount_off_centavos: {
            type: Sequelize.BIGINT,
            allowNull: true
        },
        fixed_unit_price_centavos: {
            type: Sequelize.BIGINT,
            allowNull: true
        },

        // Per-order cap. No equivalent exists on the promo path today.
        max_discount_centavos: {
            type: Sequelize.BIGINT,
            allowNull: true
        },
        min_spend_centavos: {
            type: Sequelize.BIGINT,
            allowNull: true
        },
        min_quantity: {
            type: Sequelize.INTEGER,
            allowNull: true
        },
        allow_below_cost: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        // #454 decision 10: fixed-price and statutory Senior/PWD do not combine in v1. Kept as a
        // column so #605 can revisit without a migration. See also ADR 0066 decision 8 -- POS's
        // single governed-discount slot blocks the combination more broadly than this flag does.
        stackable_with_statutory: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },

        valid_from: {
            type: Sequelize.DATEONLY,
            allowNull: true
        },
        valid_until: {
            type: Sequelize.DATEONLY,
            allowNull: true
        },
        // 'HH:mm' in the tenant storefront timezone, matching commercialPromoPolicy.js's existing
        // convention including its overnight-wrap semantics (start > end matches >= start OR <= end).
        valid_time_start: {
            type: Sequelize.STRING(5),
            allowNull: true
        },
        valid_time_end: {
            type: Sequelize.STRING(5),
            allowNull: true
        },
        weekday_mask: {
            type: Sequelize.TINYINT.UNSIGNED,
            allowNull: false,
            defaultValue: WEEKDAY_MASK_DEFAULT
        },

        // NOT NULL with explicit defaults is the structural fix for the #459 class: an absent value
        // becomes impossible to represent, instead of silently meaning "eligible everywhere".
        channels_mask: {
            type: Sequelize.TINYINT.UNSIGNED,
            allowNull: false,
            defaultValue: CHANNELS_MASK_DEFAULT
        },
        fulfillment_methods_mask: {
            type: Sequelize.TINYINT.UNSIGNED,
            allowNull: false,
            defaultValue: FULFILLMENT_METHODS_MASK_DEFAULT
        },
        order_timings_mask: {
            type: Sequelize.TINYINT.UNSIGNED,
            allowNull: false,
            defaultValue: ORDER_TIMINGS_MASK_DEFAULT
        },

        // The three exhaustion limits enforced together by one conditional UPDATE at redemption.
        max_redemptions: {
            type: Sequelize.INTEGER,
            allowNull: true
        },
        max_total_discount_centavos: {
            type: Sequelize.BIGINT,
            allowNull: true
        },
        max_benefit_quantity: {
            type: Sequelize.INTEGER,
            allowNull: true
        },

        // Derived cache of voucher_redemptions -- never the source of truth (ADR 0066 decision 4).
        redeemed_count: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        redeemed_value_centavos: {
            type: Sequelize.BIGINT,
            allowNull: false,
            defaultValue: 0
        },
        redeemed_quantity: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0
        },

        // Reserved and always empty in v1. ADR 0066 decision 9: a condition that must appear in a
        // WHERE clause cannot live here. Do not start writing conditions into this column.
        conditions: {
            type: Sequelize.JSON,
            allowNull: true
        },

        status: {
            type: Sequelize.ENUM(...VOUCHER_STATUS_VALUES),
            allowNull: false,
            defaultValue: 'draft'
        },
        // Manual optimistic locking, same convention as EmployeeCreditAccount.version -- incremented
        // explicitly by the use-case layer, not Sequelize's built-in `version: true`.
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

    await queryInterface.addIndex('vouchers', ['code'], {
        name: 'uq_vouchers_code',
        unique: true
    });
    // Drives "which vouchers are live right now" without a table scan.
    await queryInterface.addIndex('vouchers', ['status', 'valid_from', 'valid_until'], {
        name: 'idx_vouchers_status_validity'
    });
    await queryInterface.addIndex('vouchers', ['voucher_kind'], {
        name: 'idx_vouchers_kind'
    });
};

const createVoucherScopes = async (queryInterface, Sequelize) => {
    if (await tableExists(queryInterface, 'voucher_scopes')) {
        return;
    }

    await queryInterface.createTable('voucher_scopes', {
        voucher_scope_id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        voucher_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'vouchers', key: 'voucher_id' },
            onUpdate: 'RESTRICT',
            onDelete: 'CASCADE'
        },
        scope_type: {
            type: Sequelize.ENUM(...SCOPE_TYPE_VALUES),
            allowNull: false
        },
        // Polymorphic across items(item_id) and item_folders(folder_id) -- deliberately no FK.
        // Validated in voucherRepository (Phase 103). A folder scope includes its descendants, and
        // the resolved item ids are snapshotted into voucher_redemption_lines at redemption so a
        // later folder move cannot change what a completed redemption meant (ADR 0066 decision 11).
        scope_ref_id: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
    });

    await queryInterface.addIndex('voucher_scopes', ['voucher_id', 'scope_type', 'scope_ref_id'], {
        name: 'uq_voucher_scopes_voucher_type_ref',
        unique: true
    });
    // Answers "which items on this catalog page carry a voucher price?" in SQL.
    await queryInterface.addIndex('voucher_scopes', ['scope_type', 'scope_ref_id'], {
        name: 'idx_voucher_scopes_type_ref'
    });
};

const createVoucherRedemptions = async (queryInterface, Sequelize) => {
    if (await tableExists(queryInterface, 'voucher_redemptions')) {
        return;
    }

    await queryInterface.createTable('voucher_redemptions', {
        voucher_redemption_id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        voucher_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'vouchers', key: 'voucher_id' },
            onUpdate: 'RESTRICT',
            onDelete: 'RESTRICT'
        },
        entry_type: {
            type: Sequelize.ENUM(...ENTRY_TYPE_VALUES),
            allowNull: false,
            defaultValue: 'redemption'
        },
        // Holds both POS sales and online orders -- storefront checkout writes here too.
        pos_transaction_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'pos_transactions', key: 'pos_transaction_id' },
            onUpdate: 'RESTRICT',
            onDelete: 'SET NULL'
        },
        channel: {
            type: Sequelize.ENUM(...CHANNEL_VALUES),
            allowNull: false
        },
        location_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'tenant_locations', key: 'location_id' },
            onUpdate: 'RESTRICT',
            onDelete: 'SET NULL'
        },
        cashier_user_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'users', key: 'user_id' },
            onUpdate: 'RESTRICT',
            onDelete: 'SET NULL'
        },
        terminal_id: {
            type: Sequelize.STRING(100),
            allowNull: true
        },
        store_customer_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'store_customers', key: 'customer_id' },
            onUpdate: 'RESTRICT',
            onDelete: 'SET NULL'
        },
        // The only cross-DB pointer (landlord-side account). Non-authoritative, no FK possible.
        // NULL for the whole POS half by design -- #454 decision 6 makes POS redemption
        // identity-free.
        dgfy_account_id: {
            type: Sequelize.INTEGER,
            allowNull: true
        },

        code_snapshot: {
            type: Sequelize.STRING(64),
            allowNull: false
        },
        // The voucher as actually evaluated, so the record stays auditable after a later edit.
        benefit_config_snapshot: {
            type: Sequelize.JSON,
            allowNull: false
        },

        subtotal_centavos: {
            type: Sequelize.BIGINT,
            allowNull: false,
            defaultValue: 0
        },
        discount_centavos: {
            type: Sequelize.BIGINT,
            allowNull: false,
            defaultValue: 0
        },
        benefit_quantity: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0
        },

        // Counter snapshots either side of this entry, mirroring
        // EmployeeCreditLedgerEntry.balance_before/after. These are what a periodic reconciler
        // replays to prove vouchers.redeemed_* still agrees with the ledger.
        redeemed_count_before: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        redeemed_count_after: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        redeemed_value_before_centavos: {
            type: Sequelize.BIGINT,
            allowNull: false
        },
        redeemed_value_after_centavos: {
            type: Sequelize.BIGINT,
            allowNull: false
        },
        redeemed_quantity_before: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        redeemed_quantity_after: {
            type: Sequelize.INTEGER,
            allowNull: false
        },

        // NOT NULL UNIQUE, and inserted BEFORE the counter UPDATE so a replay is rejected here
        // rather than double-counting. Composition (Phase 104):
        //   redemption -> '<channel>:<transaction or checkout key>:<voucher_id>'
        //   reversal   -> 'reversal:<original voucher_redemption_id>'
        idempotency_key: {
            type: Sequelize.STRING(160),
            allowNull: false
        },
        reversal_of_redemption_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'voucher_redemptions', key: 'voucher_redemption_id' },
            onUpdate: 'RESTRICT',
            onDelete: 'SET NULL'
        },
        reason: {
            type: Sequelize.STRING(500),
            allowNull: true
        },
        metadata: {
            type: Sequelize.JSON,
            allowNull: true
        },
        created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
    });

    await queryInterface.addIndex('voucher_redemptions', ['idempotency_key'], {
        name: 'uq_voucher_redemptions_idempotency',
        unique: true
    });
    await queryInterface.addIndex('voucher_redemptions', ['voucher_id', 'created_at'], {
        name: 'idx_voucher_redemptions_voucher_created'
    });
    await queryInterface.addIndex('voucher_redemptions', ['pos_transaction_id'], {
        name: 'idx_voucher_redemptions_transaction'
    });
    await queryInterface.addIndex('voucher_redemptions', ['store_customer_id'], {
        name: 'idx_voucher_redemptions_store_customer'
    });
    await queryInterface.addIndex('voucher_redemptions', ['channel'], {
        name: 'idx_voucher_redemptions_channel'
    });
    await queryInterface.addIndex('voucher_redemptions', ['reversal_of_redemption_id'], {
        name: 'idx_voucher_redemptions_reversal_of'
    });
    // These two exist only so MySQL does not auto-create its own FK-backing index under a
    // column-derived name. Naming them keeps the emitted schema predictable, which is what
    // REQUIRED_TENANT_SCHEMA_TABLES has to reproduce byte-for-byte for existing tenants.
    await queryInterface.addIndex('voucher_redemptions', ['location_id'], {
        name: 'idx_voucher_redemptions_location'
    });
    await queryInterface.addIndex('voucher_redemptions', ['cashier_user_id'], {
        name: 'idx_voucher_redemptions_cashier'
    });
};

const createVoucherRedemptionLines = async (queryInterface, Sequelize) => {
    if (await tableExists(queryInterface, 'voucher_redemption_lines')) {
        return;
    }

    await queryInterface.createTable('voucher_redemption_lines', {
        voucher_redemption_line_id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        voucher_redemption_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'voucher_redemptions', key: 'voucher_redemption_id' },
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
        // decimal(24,12) matches pos_transaction_discount_lines.eligible_quantity.
        quantity: {
            type: Sequelize.DECIMAL(24, 12),
            allowNull: false,
            defaultValue: 0
        },
        // Both prices are stored deliberately. Item.default_sale_price is auto-updated by Dispatch
        // Order dispatches, so `base` moves; without the base snapshot, "what did this campaign
        // cost us" becomes unanswerable after the first dispatch.
        base_unit_price_centavos: {
            type: Sequelize.BIGINT,
            allowNull: false,
            defaultValue: 0
        },
        voucher_unit_price_centavos: {
            type: Sequelize.BIGINT,
            allowNull: false,
            defaultValue: 0
        },
        discount_centavos: {
            type: Sequelize.BIGINT,
            allowNull: false,
            defaultValue: 0
        },
        created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
    });

    await queryInterface.addIndex('voucher_redemption_lines', ['voucher_redemption_id'], {
        name: 'idx_voucher_redemption_lines_redemption'
    });
    await queryInterface.addIndex('voucher_redemption_lines', ['item_id'], {
        name: 'idx_voucher_redemption_lines_item'
    });
};

module.exports = {
    async up(queryInterface, Sequelize) {
        await createVouchers(queryInterface, Sequelize);
        await createVoucherScopes(queryInterface, Sequelize);
        await createVoucherRedemptions(queryInterface, Sequelize);
        await createVoucherRedemptionLines(queryInterface, Sequelize);
    },

    async down(queryInterface) {
        // Reverse dependency order.
        for (const tableName of [
            'voucher_redemption_lines',
            'voucher_redemptions',
            'voucher_scopes',
            'vouchers'
        ]) {
            if (await tableExists(queryInterface, tableName)) {
                await queryInterface.dropTable(tableName);
            }
        }
    }
};
