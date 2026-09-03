// Unit tests for Phase 242 (#1390, epic #1321)'s migration:
//   - 20260904000002-backfill-voucher-redemption-transaction-link.cjs (DATA-ONLY -- no schema
//     change, so there is no sync-tenant-schemas.js drift guard to add; see the migration's own
//     header for why).
//
// Mirrors addDeliveryVoucherBenefit.migration.test.js's fake-queryInterface shape (itself following
// 20260901000004-add-tenant-location-delivery-timing-policy.cjs's tenant fan-out pattern), adapted
// for an UPDATE...JOIN instead of ALTER TABLE statements.

import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260904000002-backfill-voucher-redemption-transaction-link.cjs');

const buildQueryInterface = ({
    tenantDbNames = [],
    tablesByDb = null,
    collationsByDb = {},
    defaultCollation = 'utf8mb4_0900_ai_ci'
} = {}) => {
    const query = jest.fn((sql, options) => {
        if (sql.includes('SELECT DATABASE()')) {
            return Promise.resolve([[{ dbName: 'landlord_db' }]]);
        }
        // Checked ABOVE the '.tables' branch below -- both fragments could otherwise match the same
        // 'information_schema.' substring depending on branch ordering, and this one is #1464's own
        // regression surface (per-db collation detection for the join's CONVERT/COLLATE fix).
        if (sql.includes('information_schema.columns')) {
            const [databaseName] = options?.replacements || [];
            const collationName = Object.prototype.hasOwnProperty.call(collationsByDb, databaseName)
                ? collationsByDb[databaseName]
                : defaultCollation;
            if (!collationName) return Promise.resolve([[]]); // simulates an unreadable/absent column
            return Promise.resolve([[{ charsetName: 'utf8mb4', collationName }]]);
        }
        if (sql.includes('information_schema.tables')) {
            // The fixture's default: every candidate database has both tables, unless tablesByDb
            // says otherwise -- table existence is not the invariant under test unless overridden.
            return Promise.resolve([[{ count: 1 }]]);
        }
        if (sql.includes('SELECT DISTINCT db_name FROM tenants')) {
            return Promise.resolve([tenantDbNames.map((dbName) => ({ db_name: dbName }))]);
        }
        // The UPDATE ... JOIN statement itself.
        return Promise.resolve([[], undefined]);
    });
    return { sequelize: { query } };
};

const updateStatementsOf = (queryInterface) => queryInterface.sequelize.query.mock.calls
    .map(([sql]) => sql)
    .filter((sql) => sql.trim().startsWith('UPDATE'));

describe('20260904000002-backfill-voucher-redemption-transaction-link up()', () => {
    it('runs one exact-key UPDATE per active tenant database plus the landlord DB', async () => {
        const queryInterface = buildQueryInterface({ tenantDbNames: ['tenant_a', 'tenant_b'] });

        await migration.up(queryInterface);

        const statements = updateStatementsOf(queryInterface);
        // landlord_db + tenant_a + tenant_b = 3.
        expect(statements).toHaveLength(3);
        for (const sql of statements) {
            expect(sql).toContain('vr.pos_transaction_id IS NULL');
            expect(sql).toContain("vr.channel = 'storefront'");
            expect(sql).toContain("vr.entry_type = 'redemption'");
            expect(sql).toContain('SET vr.pos_transaction_id = pt.pos_transaction_id');
        }
    });

    it('matches EXACTLY the item-axis and delivery-axis idempotency key shapes -- never a LIKE/prefix scan', async () => {
        const queryInterface = buildQueryInterface({});

        await migration.up(queryInterface);

        const [sql] = updateStatementsOf(queryInterface);
        expect(sql).not.toMatch(/LIKE/i);
        expect(sql).toContain("CONCAT('storefront:', pt.idempotency_key, ':', vr.voucher_id)");
        expect(sql).toContain("CONCAT('storefront:', pt.idempotency_key, ':delivery:', vr.voucher_id)");
    });

    it('skips a database missing either table entirely (pre-#455 tenant, or landlord)', async () => {
        const queryInterface = buildQueryInterface({
            tenantDbNames: ['tenant_no_vouchers'],
            tablesByDb: { tenant_no_vouchers: ['pos_transactions'] }
        });
        // Override the generic tables handler with the per-db fixture.
        queryInterface.sequelize.query.mockImplementation((sql, options) => {
            if (sql.includes('SELECT DATABASE()')) return Promise.resolve([[{ dbName: 'landlord_db' }]]);
            if (sql.includes('information_schema.columns')) {
                return Promise.resolve([[{ charsetName: 'utf8mb4', collationName: 'utf8mb4_0900_ai_ci' }]]);
            }
            if (sql.includes('information_schema.tables')) {
                const [databaseName, tableName] = options?.replacements || [];
                const tables = databaseName === 'tenant_no_vouchers'
                    ? ['pos_transactions']
                    : ['voucher_redemptions', 'pos_transactions'];
                return Promise.resolve([[{ count: tables.includes(tableName) ? 1 : 0 }]]);
            }
            if (sql.includes('SELECT DISTINCT db_name FROM tenants')) {
                return Promise.resolve([[{ db_name: 'tenant_no_vouchers' }]]);
            }
            return Promise.resolve([[], undefined]);
        });

        await migration.up(queryInterface);

        // Only landlord_db (has both tables in this fixture) runs the UPDATE.
        expect(updateStatementsOf(queryInterface)).toHaveLength(1);
    });

    it('is a no-op when the landlord DB has no tenants table at all', async () => {
        const queryInterface = buildQueryInterface({});
        queryInterface.sequelize.query.mockImplementation((sql) => {
            if (sql.includes('SELECT DATABASE()')) return Promise.resolve([[{ dbName: 'landlord_db' }]]);
            if (sql.includes('information_schema.tables')) return Promise.resolve([[{ count: 0 }]]);
            return Promise.resolve([[], undefined]);
        });

        await migration.up(queryInterface);

        expect(updateStatementsOf(queryInterface)).toHaveLength(0);
    });

    it('emits SET before WHERE, and WHERE containing pos_transaction_id IS NULL, in every UPDATE -- regression for #1401 (invalid multi-table UPDATE syntax: SET must precede WHERE)', async () => {
        const queryInterface = buildQueryInterface({ tenantDbNames: ['tenant_a', 'tenant_b'] });

        await migration.up(queryInterface);

        const statements = updateStatementsOf(queryInterface);
        expect(statements.length).toBeGreaterThan(0);
        for (const sql of statements) {
            const setIndex = sql.indexOf(' SET ');
            const whereIndex = sql.indexOf(' WHERE ');
            expect(setIndex).toBeGreaterThan(-1);
            expect(whereIndex).toBeGreaterThan(-1);
            expect(setIndex).toBeLessThan(whereIndex);
            expect(sql.slice(whereIndex)).toContain('vr.pos_transaction_id IS NULL');
        }
    });

    // #1464 regression: on real MySQL 8, vr.idempotency_key (utf8mb4_0900_ai_ci, pinned by PR #636's
    // sync-tenant-schemas.js repair path) and CONCAT(...)'s connection-default collation
    // (utf8mb4_unicode_ci on affected tenants, since pos_transactions has no repair-path pin of its
    // own) don't match -- MySQL error 1267, "Illegal mix of collations". Every emitted UPDATE must
    // pin the CONCAT(...) side to vr.idempotency_key's own detected collation via CONVERT(...USING...)
    // COLLATE ....
    it('pins CONCAT(...) to the detected collation via CONVERT(...USING utf8mb4) COLLATE ... -- regression for #1464 (illegal mix of collations)', async () => {
        const queryInterface = buildQueryInterface({
            tenantDbNames: ['tenant_a'],
            defaultCollation: 'utf8mb4_0900_ai_ci'
        });

        await migration.up(queryInterface);

        const statements = updateStatementsOf(queryInterface);
        expect(statements.length).toBeGreaterThan(0);
        for (const sql of statements) {
            expect(sql).toContain(
                "CONVERT(CONCAT('storefront:', pt.idempotency_key, ':', vr.voucher_id) USING utf8mb4) COLLATE utf8mb4_0900_ai_ci"
            );
            expect(sql).toContain(
                "CONVERT(CONCAT('storefront:', pt.idempotency_key, ':delivery:', vr.voucher_id) USING utf8mb4) COLLATE utf8mb4_0900_ai_ci"
            );
        }
    });

    it('detects the collation per database, not a hardcoded value -- two tenants with different collations get different COLLATE clauses', async () => {
        const queryInterface = buildQueryInterface({
            tenantDbNames: ['tenant_a', 'tenant_b'],
            collationsByDb: { tenant_a: 'utf8mb4_unicode_ci', tenant_b: 'utf8mb4_0900_ai_ci' }
        });

        await migration.up(queryInterface);

        const calls = queryInterface.sequelize.query.mock.calls;
        const updateCallFor = (databaseName) => calls
            .map(([sql]) => sql)
            .filter((sql) => sql.trim().startsWith('UPDATE'))
            .find((sql) => sql.includes(`\`${databaseName}\`.\`voucher_redemptions\``));

        const tenantASql = updateCallFor('tenant_a');
        const tenantBSql = updateCallFor('tenant_b');
        expect(tenantASql).toContain('COLLATE utf8mb4_unicode_ci');
        expect(tenantASql).not.toContain('COLLATE utf8mb4_0900_ai_ci');
        expect(tenantBSql).toContain('COLLATE utf8mb4_0900_ai_ci');
        expect(tenantBSql).not.toContain('COLLATE utf8mb4_unicode_ci');
    });

    it('leaves vr.idempotency_key itself uncollated -- keeps uq_voucher_redemptions_idempotency usable on the join', async () => {
        const queryInterface = buildQueryInterface({});

        await migration.up(queryInterface);

        const [sql] = updateStatementsOf(queryInterface);
        expect(sql).toMatch(/ON vr\.idempotency_key IN \(/);
        expect(sql).not.toMatch(/vr\.idempotency_key\s+COLLATE/i);
    });

    it('skips a database whose join-key collation cannot be read (empty information_schema.columns result)', async () => {
        const queryInterface = buildQueryInterface({
            tenantDbNames: ['tenant_unreadable'],
            collationsByDb: { tenant_unreadable: '' }
        });

        await migration.up(queryInterface);

        const calls = queryInterface.sequelize.query.mock.calls;
        const tenantUnreadableUpdates = calls
            .map(([sql]) => sql)
            .filter((sql) => sql.trim().startsWith('UPDATE'))
            .filter((sql) => sql.includes('`tenant_unreadable`.`voucher_redemptions`'));
        expect(tenantUnreadableUpdates).toHaveLength(0);
    });

    it('never interpolates an unvalidated collation name into SQL -- SQL-injection guard', async () => {
        const queryInterface = buildQueryInterface({
            tenantDbNames: ['tenant_hostile'],
            collationsByDb: { tenant_hostile: 'utf8mb4_x; DROP TABLE voucher_redemptions' }
        });

        await migration.up(queryInterface);

        const calls = queryInterface.sequelize.query.mock.calls;
        const tenantHostileUpdates = calls
            .map(([sql]) => sql)
            .filter((sql) => sql.trim().startsWith('UPDATE'))
            .filter((sql) => sql.includes('`tenant_hostile`.`voucher_redemptions`'));
        expect(tenantHostileUpdates).toHaveLength(0);

        const allSql = calls.map(([sql]) => sql).join('\n');
        expect(allSql).not.toMatch(/DROP/i);
    });
});

describe('20260904000002-backfill-voucher-redemption-transaction-link down()', () => {
    // RF-1 (PR #1395 review): up()'s join (idempotency-key pattern + pos_transaction_id equality)
    // cannot distinguish a row this migration backfilled from a row the checkout-side
    // attachRedemptionsToTransaction path legitimately set afterward -- both satisfy the identical
    // join. A down() built on that join would silently null out live, freshly-created attribution
    // links the moment any real checkout has happened post-deploy. down() is forward-only instead:
    // it always throws and never issues a query, so a post-`up()` checkout link can never be erased
    // by a rollback -- see the migration's own rollback_note header for the full reasoning.
    it('always throws -- forward-only, never issues a query', async () => {
        const queryInterface = buildQueryInterface({ tenantDbNames: ['tenant_a'] });

        await expect(migration.down(queryInterface)).rejects.toThrow(/forward-only/i);

        expect(queryInterface.sequelize.query).not.toHaveBeenCalled();
    });

    it('throws before touching any database, even when tenants exist', async () => {
        const queryInterface = buildQueryInterface({ tenantDbNames: ['tenant_a', 'tenant_b'] });

        await expect(migration.down(queryInterface)).rejects.toThrow();

        expect(updateStatementsOf(queryInterface)).toHaveLength(0);
    });

    it('a post-up() checkout-side link survives an attempted down() (it throws instead of nulling anything)', async () => {
        const queryInterface = buildQueryInterface({});

        await migration.up(queryInterface); // legacy rows backfilled
        // Simulate ordinary post-deploy checkout traffic writing a new, legitimate link via the
        // checkout-side path -- not exercised via this fake queryInterface's UPDATE statements
        // directly, since that write lives in application code, not this migration. The point under
        // test is only that down() never gets the chance to null anything out, regardless of what's
        // in the table.
        await expect(migration.down(queryInterface)).rejects.toThrow(/forward-only/i);

        // Only up()'s UPDATE ran; down() issued none.
        expect(updateStatementsOf(queryInterface)).toHaveLength(1);
    });
});
