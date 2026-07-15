/**
 * Phase 03 Plan 03 (MIG-02, T-03-03-01): read-only legacy source snapshot
 * readers.
 *
 * Every function here issues only `SELECT` statements, scoped strictly to
 * the migration target manifest's entries (D-01, 03-01) — never enumerates
 * every legacy tenant/account. Phase 13 expands the allowed tenant-local read
 * surface to the product and inventory source tables approved by ADR 0029's
 * v2.1 amendment. Zero runtime imports from the legacy application — the
 * runner stays dependency-isolated (Phase 1 D-01); this module only issues raw
 * SQL against whatever Sequelize connection the caller (`src/data/dryRun.js`)
 * already opened via `src/config/db.js`'s factories (`createSourceConnection()`
 * for the legacy landlord DB, `createLegacyTenantSourceConnection()` for a
 * single legacy tenant DB — both already reject any `dgfy_*`-named database
 * before this module ever sees a connection).
 *
 * Allowed source tables (docs/database/dgfy-data-migration-map.md):
 * - landlord: `tenants`, `dgfy_accounts`, `dgfy_account_tenant_memberships`
 * - tenant-local (identity): `users`, `tenant_locations`,
 *   `user_location_grants`, `system_settings` (only the row whose
 *   `setting_key` is `'pos_terminal_registry'`)
 * - tenant-local (Phase 13 product domain): `items`, `item_nutrition`,
 *   `item_allergens`, `item_physical_properties`, `item_shelf_life`,
 *   `item_packaging`, `item_quality_control`,
 *   `item_regulatory_compliance`, `item_cost_breakdown`, `item_barcodes`,
 *   `product_composition`, `item_folders`, `stock_movements`,
 *   `item_location_stocks`, `item_embeddings`
 * - tenant-local (Phase 14 sales-history domain, D-14-06): `pos_transactions`,
 *   `pos_transaction_lines` — both full unpaginated scans, every run, no
 *   watermark/checkpoint cursor (this is a one-time cutover migration, not a
 *   continuous sync; `legacy_id_map` is the sole idempotency guard).
 *
 * Still never queried in this reader: `pos_terminal_shifts`,
 * `cashier_sessions`, `terminal_sessions`, `fiscal_receipts`,
 * `fiscal_compliance_logs`, `products`, `skus`, `purchase_orders`,
 * `job_orders`, or any other table that remains in `mappings.js`'s
 * `OUT_OF_SCOPE_LEGACY_TABLES` list (ADR 0029). The exclusion is structural,
 * not a runtime filter.
 */

const POS_TERMINAL_REGISTRY_SETTING_KEY = 'pos_terminal_registry';

/**
 * Reads landlord-scoped legacy source data for exactly the manifest-listed
 * targets: the `tenants` rows themselves (scoped by `legacy_tenant_id` via a
 * `WHERE id IN (...)`), every `dgfy_account_tenant_memberships` row for
 * those tenants, and every `dgfy_accounts` row referenced by either a
 * tenant's `owner_dgfy_account_id` or a membership's `dgfy_account_id`.
 * Never queries the full `tenants`/`dgfy_accounts` tables unscoped, and
 * issues zero queries at all when `targets` is empty (D-01: never
 * auto-discovers).
 *
 * @param {import('sequelize').Sequelize} landlordSequelize
 * @param {Array<{ legacy_tenant_id: string }>} targets validated manifest targets
 * @returns {Promise<{ tenants: object[], accounts: object[], memberships: object[] }>}
 */
export async function readLegacyLandlordSnapshot(landlordSequelize, targets = []) {
    const tenantIds = targets.map((target) => target.legacy_tenant_id).filter(Boolean);

    if (tenantIds.length === 0) {
        return { tenants: [], accounts: [], memberships: [] };
    }

    const [tenants] = await landlordSequelize.query(
        'SELECT * FROM tenants WHERE id IN (:tenantIds)',
        { replacements: { tenantIds } }
    );

    const [memberships] = await landlordSequelize.query(
        'SELECT * FROM dgfy_account_tenant_memberships WHERE tenant_id IN (:tenantIds)',
        { replacements: { tenantIds } }
    );

    const accountIds = new Set();
    tenants.forEach((tenant) => {
        if (tenant.owner_dgfy_account_id) {
            accountIds.add(tenant.owner_dgfy_account_id);
        }
    });
    memberships.forEach((membership) => {
        if (membership.dgfy_account_id) {
            accountIds.add(membership.dgfy_account_id);
        }
    });

    const accountIdList = Array.from(accountIds);
    const accounts = accountIdList.length > 0
        ? (await landlordSequelize.query(
            'SELECT * FROM dgfy_accounts WHERE id IN (:accountIds)',
            { replacements: { accountIds: accountIdList } }
        ))[0]
        : [];

    return { tenants, accounts, memberships };
}

/**
 * Parses the single `system_settings` row for `pos_terminal_registry` into
 * an array of registry entries, matching the shape
 * the legacy settings repository stores (`setting_value` is the
 * `JSON.stringify()`-encoded array directly, not
 * wrapped in a `{ value: [...] }` envelope) — while defensively also
 * accepting a `{ value: [...] }` envelope shape, since
 * `posTerminalRegistrySecrets.js` reads it either way depending on caller.
 * Never throws on malformed JSON; returns an empty array instead so a single
 * corrupt legacy setting row never aborts the whole snapshot read.
 */
function parseTerminalRegistrySetting(settingRow) {
    if (!settingRow || settingRow.setting_value === undefined || settingRow.setting_value === null) {
        return [];
    }

    let parsed;
    try {
        parsed = JSON.parse(settingRow.setting_value);
    } catch {
        return [];
    }

    if (Array.isArray(parsed)) {
        return parsed;
    }
    if (parsed && Array.isArray(parsed.value)) {
        return parsed.value;
    }
    return [];
}

function keyBy(rows, key) {
    const lookup = new Map();
    rows.forEach((row) => {
        const value = row?.[key];
        if (value !== undefined && value !== null && !lookup.has(value)) {
            lookup.set(value, row);
        }
    });
    return lookup;
}

function groupBy(rows, key) {
    const lookup = new Map();
    rows.forEach((row) => {
        const value = row?.[key];
        if (value === undefined || value === null) return;
        const bucket = lookup.get(value) || [];
        bucket.push(row);
        lookup.set(value, bucket);
    });
    return lookup;
}

/**
 * Reads tenant-local legacy source data for a single already-scoped legacy
 * tenant database connection (`src/config/db.js`'s
 * `createLegacyTenantSourceConnection()` rejects any `dgfy_*`-named database
 * before this is ever called, and the caller opens exactly one connection
 * per manifest target — never an unscoped "every tenant" loop). Reads only:
 * `users`, `tenant_locations`, `user_location_grants`, and the single
 * `system_settings` row whose `setting_key` is `'pos_terminal_registry'`
 * (parsed into an array of registry entries). Never queries
 * `pos_transactions`, `pos_terminal_shifts`, fiscal tables, product/
 * inventory tables, or any other tenant-local table.
 *
 * @param {import('sequelize').Sequelize} tenantSequelize
 * @returns {Promise<{ users: object[], locations: object[], userLocationGrants: object[], terminalRegistry: object[] }>}
 */
export async function readLegacyTenantSnapshot(tenantSequelize) {
    const [users] = await tenantSequelize.query('SELECT * FROM users');
    const [locations] = await tenantSequelize.query('SELECT * FROM tenant_locations');
    const [userLocationGrants] = await tenantSequelize.query('SELECT * FROM user_location_grants');
    const [settingsRows] = await tenantSequelize.query(
        'SELECT * FROM system_settings WHERE setting_key = ?',
        { replacements: [POS_TERMINAL_REGISTRY_SETTING_KEY] }
    );

    const terminalRegistry = parseTerminalRegistrySetting(settingsRows[0]);

    return { users, locations, userLocationGrants, terminalRegistry };
}

/**
 * Reads tenant-local Phase 13 product/inventory source rows from one already-
 * scoped legacy tenant connection and stitches the satellite tables onto each
 * item using the same association aliases documented in the legacy product
 * attributes folding design.
 *
 * @param {import('sequelize').Sequelize} tenantSequelize
 * @returns {Promise<{ items: object[], itemFolders: object[], stockMovements: object[], itemEmbeddings: object[] }>}
 */
export async function readLegacyProductSnapshot(tenantSequelize) {
    const [items] = await tenantSequelize.query('SELECT * FROM items');
    const [nutritionRows] = await tenantSequelize.query('SELECT * FROM item_nutrition');
    const [allergenRows] = await tenantSequelize.query('SELECT * FROM item_allergens');
    const [physicalPropertyRows] = await tenantSequelize.query('SELECT * FROM item_physical_properties');
    const [shelfLifeRows] = await tenantSequelize.query('SELECT * FROM item_shelf_life');
    const [packagingRows] = await tenantSequelize.query('SELECT * FROM item_packaging');
    const [qualityControlRows] = await tenantSequelize.query('SELECT * FROM item_quality_control');
    const [regulatoryComplianceRows] = await tenantSequelize.query('SELECT * FROM item_regulatory_compliance');
    const [costBreakdownRows] = await tenantSequelize.query('SELECT * FROM item_cost_breakdown');
    const [barcodeRows] = await tenantSequelize.query('SELECT * FROM item_barcodes');
    const [productCompositionRows] = await tenantSequelize.query('SELECT * FROM product_composition');
    const [itemFolders] = await tenantSequelize.query('SELECT * FROM item_folders');
    const [stockMovements] = await tenantSequelize.query('SELECT * FROM stock_movements');
    const [itemLocationStockRows] = await tenantSequelize.query('SELECT * FROM item_location_stocks');
    const [itemEmbeddings] = await tenantSequelize.query('SELECT * FROM item_embeddings');

    const oneToOneLookups = {
        nutrition: keyBy(nutritionRows, 'item_id'),
        physicalProperties: keyBy(physicalPropertyRows, 'item_id'),
        shelfLife: keyBy(shelfLifeRows, 'item_id'),
        packaging: keyBy(packagingRows, 'item_id'),
        qualityControl: keyBy(qualityControlRows, 'item_id'),
        regulatoryCompliance: keyBy(regulatoryComplianceRows, 'item_id'),
        costBreakdown: keyBy(costBreakdownRows, 'item_id')
    };
    const allergenLookup = groupBy(allergenRows, 'item_id');
    const barcodeLookup = groupBy(barcodeRows, 'item_id');
    const itemLocationStockLookup = groupBy(itemLocationStockRows, 'item_id');
    const productCompositionLookup = groupBy(productCompositionRows, 'product_id');

    const stitchedItems = items.map((item) => {
        const stitchedItem = { ...item };
        Object.entries(oneToOneLookups).forEach(([alias, lookup]) => {
            const row = lookup.get(item.item_id);
            if (row) {
                stitchedItem[alias] = row;
            }
        });
        stitchedItem.allergens = allergenLookup.get(item.item_id) || [];
        stitchedItem.barcodes = barcodeLookup.get(item.item_id) || [];
        stitchedItem.itemLocationStocks = itemLocationStockLookup.get(item.item_id) || [];
        stitchedItem.productCompositions = productCompositionLookup.get(item.item_id) || [];
        return stitchedItem;
    });

    return {
        items: stitchedItems,
        itemFolders,
        stockMovements,
        itemEmbeddings
    };
}

/**
 * Phase 14 Plan 04 (SHM-01/02, D-14-06): read-only legacy sales-history
 * snapshot reader for a single already-scoped legacy tenant connection.
 * Issues exactly one full unpaginated `SELECT * FROM pos_transactions` and
 * one full unpaginated `SELECT * FROM pos_transaction_lines`, returning both
 * result sets verbatim (no stitching, no target lookup, no write). D-14-06:
 * this is a live, continuously-growing source table, but the migration is a
 * one-time bounded cutover, not a continuous sync — no watermark/checkpoint
 * cursor is added here; `legacy_id_map` lookup-before-insert (dryRun.js/
 * apply.js) is the sole idempotency guard, exactly like every other reader
 * in this module.
 *
 * @param {import('sequelize').Sequelize} tenantSequelize
 * @returns {Promise<{ posTransactions: object[], posTransactionLines: object[] }>}
 */
export async function readLegacySalesSnapshot(tenantSequelize) {
    const [posTransactions] = await tenantSequelize.query('SELECT * FROM pos_transactions');
    const [posTransactionLines] = await tenantSequelize.query('SELECT * FROM pos_transaction_lines');

    return { posTransactions, posTransactionLines };
}
