import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { readdirSync } from 'fs';
import { Sequelize } from 'sequelize';

/**
 * Wave 8 gap-closure (04-08-PLAN.md, Task 2) shared test helper.
 *
 * The create-business request path (POST /businesses) only ever creates
 * SAFE `provisioning` registry metadata (businessDatabaseRegistryRepository.
 * findOrCreateForBusiness()) — it never creates the actual dgfy_business_*
 * database or applies any schema migration itself (04-06-SUMMARY.md's
 * documented contract). A separate operator/migration-runner handoff
 * applies + verifies the tenant schema for that exact `database_name`, then
 * flips the registry to `active`/`verified`.
 *
 * 04-09 gap closure: that operator/migration-runner handoff now SHIPS as a
 * real, production CLI command — `activate-tenant --database-name=<name>`
 * in apps/dgfy-migration-runner (src/commands/activateTenant.js). This
 * helper is a fast, IN-PROCESS CI stand-in for that shipped command (used
 * by businessFlows.test.js, businessValidation.test.js,
 * tenantSessionFlows.test.js, tenantSessionValidation.test.js, and four of
 * phase4FullFlow.test.js's five journeys) so the exact same real-migration +
 * real-verification behavior is exercised consistently across those suites
 * without spawning a subprocess for every gated test — it is NOT a stand-in
 * for an unbuilt mechanism. phase4FullFlow.test.js's Journey 5 additionally
 * proves the real subprocess path by spawning the shipped `activate-tenant`
 * CLI directly via `child_process`, closing the loop from test fixture to
 * production command.
 *
 * IMPORTANT correctness fix this helper embodies (found during Task 2,
 * see 04-08-SUMMARY.md's Deviations): every pre-existing gated suite in this
 * phase called `businessDatabaseRegistryRepository.create({...status:
 * 'active'})` AFTER POST /businesses had already inserted a `provisioning`
 * row for the same businessId via findOrCreateForBusiness() — creating a
 * SECOND registry row per business. `business_database_registry` has no
 * unique constraint on `business_id` (only on `database_name`), so this
 * silently succeeded but left `findByBusinessId()` free to resolve either
 * row (typically the OLDER, still-`provisioning` one), a genuine latent bug
 * that would misroute production/test HTTP flows once real MySQL exists.
 * This helper instead resolves the EXISTING `provisioning` row's
 * `database_name` via `findByBusinessId()` and only ever calls
 * `updateStatus()` on it.
 */

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationRunnerRoot = path.resolve(__dirname, '../../../dgfy-migration-runner');
const migrationsSchemaDir = path.join(migrationRunnerRoot, 'src/migrations/schema');

/**
 * Loads every business-target schema migration (meta.targetKind === 'business')
 * under apps/dgfy-migration-runner's migrations/schema directory, in the same
 * filename-sorted (timestamp-prefixed) order the real migration-runner's
 * buildMigrationsForKind() applies them in. Required (not imported) via
 * createRequire so this ESM test helper can load the CommonJS migration
 * modules cross-package without adding a new package dependency.
 *
 * Dynamic (not hardcoded to a fixed list of files) so this helper never goes
 * stale again as new business-target migrations land in later phases — the
 * prior hardcoded two-migration list silently drifted behind Phase 8/9's
 * additions and broke every consumer's dgfyBusinessContract verification.
 */
function loadBusinessTargetMigrations() {
    return readdirSync(migrationsSchemaDir)
        .filter((file) => file.endsWith('.cjs'))
        .sort()
        .map((file) => require(path.join(migrationsSchemaDir, file)))
        .filter((migration) => (migration.meta?.targetKind || 'core') === 'business');
}

/**
 * Applies the REAL migration-runner dgfy_business_* schema migrations
 * (never an ad hoc `model.sync({force:true})`) against a tenant Sequelize
 * connection, then verifies every table the migration-runner's own
 * dgfyBusinessContract.js declares actually exists — proving durable
 * schema-migration correctness, not just Sequelize-model-shape agreement.
 * @param {import('sequelize').Sequelize} tenantConnection
 */
export async function applyAndVerifyBusinessSchema(tenantConnection) {
    const queryInterface = tenantConnection.getQueryInterface();

    const migrations = loadBusinessTargetMigrations();
    for (const migration of migrations) {
        // eslint-disable-next-line no-await-in-loop -- migrations must apply in order
        await migration.up(queryInterface, Sequelize);
    }

    const { dgfyBusinessContract } = await import(
        path.join(migrationRunnerRoot, 'src/schemaContracts/dgfyBusinessContract.js')
    );
    const expectedTables = Object.keys(dgfyBusinessContract.tables);
    // Mirrors the migration files' own tolerant table-name extraction
    // (showAllTables() may return plain strings or {tableName}/{table_name}
    // objects depending on dialect/driver version).
    const rawTables = await queryInterface.showAllTables();
    const actualTables = (rawTables || []).map((entry) => {
        const value = typeof entry === 'string' ? entry : (entry?.tableName || entry?.table_name || String(entry));
        return String(value).toLowerCase();
    });
    const missingTables = expectedTables.filter((table) => !actualTables.includes(table.toLowerCase()));

    if (missingTables.length > 0) {
        throw new Error(
            'applyAndVerifyBusinessSchema: tenant schema verification against dgfyBusinessContract failed — '
            + `missing tables: ${missingTables.join(', ')}`
        );
    }
}

/**
 * Operator/migration-runner handoff test double (04-08-PLAN.md, Task 2):
 * resolves the EXISTING `provisioning` registry row created by POST
 * /businesses (never creates a second row), creates the disposable
 * dgfy_business_* schema for that exact `database_name`, applies + verifies
 * the real migration-runner schema against it, then marks the registry
 * `active`/`verified`.
 * @param {{
 *   businessDatabaseRegistryRepository: Object,
 *   tenantConnector: Object,
 *   withAdminConnection: (fn: (adminSequelize: Sequelize) => Promise<any>) => Promise<any>,
 *   businessId: string,
 *   provisionedTenantDbNames: string[]
 * }} args
 * @returns {Promise<string>} the tenant database_name
 */
export async function provisionAndActivateTenantDatabase({
    businessDatabaseRegistryRepository,
    tenantConnector,
    withAdminConnection,
    businessId,
    provisionedTenantDbNames
}) {
    const registryEntry = await businessDatabaseRegistryRepository.findByBusinessId(businessId);
    if (!registryEntry || !registryEntry.database_name) {
        throw new Error(
            `provisionAndActivateTenantDatabase: no provisioning registry entry found for business ${businessId} `
            + '— was it created via POST /businesses (findOrCreateForBusiness)?'
        );
    }
    const { database_name: databaseName } = registryEntry;

    await withAdminConnection(async (adminSequelize) => {
        await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\``);
    });
    provisionedTenantDbNames.push(databaseName);

    const tenantConnection = tenantConnector.getConnection(databaseName);
    await applyAndVerifyBusinessSchema(tenantConnection);

    await businessDatabaseRegistryRepository.updateStatus({
        businessId,
        status: 'active',
        verifiedAt: new Date()
    });

    return databaseName;
}

export default { applyAndVerifyBusinessSchema, provisionAndActivateTenantDatabase };
