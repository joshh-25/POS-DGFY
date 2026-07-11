/**
 * Phase 03 Plan 03 (MIG-02, T-03-03-01): read-only legacy source snapshot
 * readers.
 *
 * Every function here issues only `SELECT` statements, scoped strictly to
 * the migration target manifest's entries (D-01, 03-01) — never enumerates
 * every legacy tenant/account, and never reads product, inventory, checkout,
 * POS operational, payment, shift, or fiscal tables (ADR 0029). Zero backend
 * runtime imports — the runner stays isolated from `backend/`'s dependency
 * surface (Phase 1 D-01); this module only issues raw SQL against whatever
 * Sequelize connection the caller (`src/data/dryRun.js`) already opened via
 * `src/config/db.js`'s factories (`createSourceConnection()` for the legacy
 * landlord DB, `createLegacyTenantSourceConnection()` for a single legacy
 * tenant DB — both already reject any `dgfy_*`-named database before this
 * module ever sees a connection).
 *
 * Allowed source tables (docs/database/dgfy-data-migration-map.md):
 * - landlord: `tenants`, `dgfy_accounts`, `dgfy_account_tenant_memberships`
 * - tenant-local: `users`, `tenant_locations`, `user_location_grants`,
 *   `system_settings` (only the row whose `setting_key` is
 *   `'pos_terminal_registry'`)
 *
 * Never queried: `pos_transactions`, `pos_terminal_shifts`,
 * `cashier_sessions`, `terminal_sessions`, `fiscal_receipts`,
 * `fiscal_compliance_logs`, `items`, `products`, `skus`, `purchase_orders`,
 * `job_orders`, `stock_movements`, or any other table in
 * `mappings.js`'s `OUT_OF_SCOPE_LEGACY_TABLES` list (ADR 0029) — this module
 * simply never issues a query naming those tables, so the exclusion is
 * structural, not a runtime filter.
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
 * `backend/src/modules/settings/repositories/settingsRepository.js` stores
 * (`setting_value` is the `JSON.stringify()`-encoded array directly, not
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
