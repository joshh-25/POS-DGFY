// #1071/#1124: the one seam `provisionTenant` (tenantProvisioningService.js) calls to bring a
// freshly-synced tenant database up to the full schema shape it needs -- everything
// `Sequelize.sync()` cannot express: repair steps for the item/folder/category lifecycle schema,
// and the Phase 157 cashier-attendance/operator-session migrations.
//
// Previously `provisionTenant` did this inline, importing three things directly (the repair
// function, plus two migration files by literal path into apps/dgfy-migration-runner) -- fragile in
// two ways: every future Phase-N migration needed there had to be hand-appended at that one call
// site with no check that it stayed correct, and a unit test exercising `provisionTenant` (like
// tests/tenantProvisioning.storefrontBootstrap.test.js) ended up accidentally executing real POS
// migration internals it had no opinion about, purely because it mocked `Sequelize.prototype.sync`
// loosely enough to let the code reach that far. Folding both concerns into one function here means
// a test can mock this single seam instead of the migration internals underneath it, and the next
// repair/migration this tenant-bootstrap path needs gets one call site to add it to, not three.
import {
    repairItemFolderCategoryLifecycleSchema,
    reconcileTenantSchema,
    summarizeTenantSchemaReconciliation
} from '../../scripts/sync-tenant-schemas.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// .cjs, required rather than imported -- matches how the migrations themselves are authored
// (Sequelize CLI's standard module.exports shape). #1819: sourced from the shared
// packages/tenant-bootstrap package (a real npm `file:` dependency, shipped into this app's
// Docker image like packages/shared-constants already is) instead of reaching across into the
// sibling apps/dgfy-migration-runner app at runtime -- that cross-app path does not exist inside
// the built image, which is exactly what broke tenant approval (#1819).
const { applyTenantBootstrapMigrations } = require('@sieitzz/tenant-bootstrap');

/**
 * Brings a freshly-`sync()`'d tenant database up to the schema shape `provisionTenant` needs.
 * Call this once, immediately after `tenantSequelize.sync()`, before seeding.
 *
 * @param {import('sequelize').Sequelize} tenantSequelize the tenant's own Sequelize connection
 * @param {typeof import('sequelize').Sequelize} SequelizeNamespace the Sequelize class/DataTypes
 *   namespace, forwarded to the migration manifest's `up(queryInterface, Sequelize)` calls
 * @param {{ dbName: string }} options
 */
export async function applyPostSyncTenantSchema(tenantSequelize, SequelizeNamespace, { dbName }) {
    await repairItemFolderCategoryLifecycleSchema(tenantSequelize, dbName);
    // Sequelize sync cannot express the generated active-state columns used by the cashier
    // attendance/operator-session uniqueness contract. Apply the idempotent Phase 157 migrations
    // immediately after the model graph is created so a brand-new tenant has the same constraints
    // as an existing tenant repaired by the migration runner.
    await applyTenantBootstrapMigrations(tenantSequelize.getQueryInterface(), SequelizeNamespace);

    // #2027: hard precondition. Reconcile against the full canonical schema-capability registry
    // (tables/columns/indexes/seeds/enum contracts) -- the same registry sync-tenant-schemas.js's
    // report/repair-apply modes check for EXISTING tenants -- so a freshly-provisioned tenant can
    // never reach `active` with less schema than an existing, repaired tenant. This is exactly
    // what a prior version of provisioning skipped: it ran only the two steps above, never this
    // registry, which is how a production tenant was once activated missing several generated
    // columns, indexes, and seed rows the registry already covered.
    //
    // Deliberately calls reconcileTenantSchema directly rather than going through
    // runTenantSchemaSync/the CLI, bypassing assertTenantSchemaMutationModeAllowed/
    // TENANT_SCHEMA_MUTATION_APPROVED (that gate is only invoked once, at the top of
    // runTenantSchemaSync -- reconcileTenantSchema itself never calls it). That's correct, not an
    // accidental gap: the gate exists to stop an operator's copy-pasted command or deploy
    // configuration from silently mutating an EXISTING active tenant's database. It does not apply
    // here -- this repairs a brand-new, not-yet-active database that provisionTenant itself
    // created moments ago and will drop entirely via its own catch-block compensating transaction
    // on any failure from this point on. There is no existing production data for that gate to
    // protect.
    //
    // Passes tenantSequelize directly (not a fresh raw mysql2 connection) -- every inspect/repair
    // function reconcileTenantSchema calls is connection-shape-agnostic via queryWithReplacements,
    // and tenantSequelize is already scoped to `dbName`.
    const reconciliation = await reconcileTenantSchema(tenantSequelize, dbName, 'repair-apply');
    if (reconciliation.hasRemainingIssues) {
        throw new Error(
            `Tenant schema capability postcondition failed for ${dbName}: `
            + summarizeTenantSchemaReconciliation(reconciliation.remaining).join(', ')
        );
    }
}
