'use strict';

// #1071/#1124: the small, ordered set of migrations that must run against a brand-new tenant
// database immediately after `Sequelize.sync()`, before that tenant is usable -- because
// `sync()` cannot express everything a real migration can (generated columns, the cashier
// attendance/operator-session uniqueness contract added in Phase 157, see the migrations
// themselves). Previously `apps/dgfy-api/src/services/tenantProvisioningService.js` hand-imported
// each of these by literal relative path, in order, directly in `provisionTenant` -- three separate
// places that had to be kept in sync by hand (this manifest, provisionTenant's own import order,
// and the migration-runner's own timestamp ordering) with no check that any of them agreed. This
// manifest is the one place ordering knowledge lives now; `provisionTenant` calls
// `applyTenantBootstrapMigrations` instead of importing migration files itself.
//
// Ordering is significant -- entries run in array order via `up()`, not sorted or discovered.
const TENANT_BOOTSTRAP_MIGRATIONS = Object.freeze([
    '../migrations/20260824000001-create-pos-cashier-attendance-operator-sessions.cjs',
    '../migrations/20260824000002-add-pos-attendance-idempotency.cjs',
]);

// Adding a migration to this manifest whose file was renamed, moved, or deleted is exactly the
// #1071-class failure this manifest exists to prevent -- resolve+require eagerly here (module
// load time), not lazily inside applyTenantBootstrapMigrations, so a stale entry fails loudly the
// moment this file is loaded rather than only when a tenant happens to be provisioned.
const resolved = TENANT_BOOTSTRAP_MIGRATIONS.map((relativePath) => {
    const absolutePath = require.resolve(relativePath, { paths: [__dirname] });
    const migration = require(absolutePath);
    if (typeof migration.up !== 'function') {
        throw new Error(
            `tenantBootstrapManifest: "${relativePath}" has no up() export -- is it a real Sequelize migration file?`
        );
    }
    return { relativePath, migration };
});

// Applies every manifest entry's `up()` in order against the given tenant connection. Mirrors the
// exact call shape `provisionTenant` used to make inline (queryInterface + the Sequelize
// constructor/DataTypes namespace), just centralized here instead of repeated per call site.
async function applyTenantBootstrapMigrations(queryInterface, Sequelize) {
    for (const { relativePath, migration } of resolved) {
        try {
            await migration.up(queryInterface, Sequelize);
        } catch (error) {
            error.message = `tenantBootstrapManifest: "${relativePath}" failed during tenant bootstrap: ${error.message}`;
            throw error;
        }
    }
}

module.exports = {
    TENANT_BOOTSTRAP_MIGRATIONS,
    applyTenantBootstrapMigrations,
};
