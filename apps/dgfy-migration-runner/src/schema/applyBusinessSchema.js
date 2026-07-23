import { Umzug } from 'umzug';

import { buildMigrationsForKind } from '../commands/schema.js';
import { MetaSequelizeStorage } from '../metadata/storage.js';
import { assertDestructiveAllowed } from '../safety/destructiveGate.js';
import { dgfyBusinessContract } from '../schemaContracts/dgfyBusinessContract.js';

/**
 * 04-09 gap closure: production analog of
 * apps/dgfy-api/tests/helpers/tenantSchemaProvisioning.js's
 * applyAndVerifyBusinessSchema — built from the runner's own reusable
 * pieces (buildMigrationsForKind, MetaSequelizeStorage,
 * assertDestructiveAllowed) rather than hardcoding migration filenames, so
 * future business-kind migrations are picked up automatically.
 *
 * Applies every pending `meta.targetKind==='business'` migration against
 * `tenantSequelize` (recording progress in `metaSequelize`'s
 * dgfy_migration_meta.schema_migrations, scoped to `databaseName`), then
 * verifies every table dgfyBusinessContract.tables declares actually exists
 * on the tenant connection. Throws (naming the missing tables) on any
 * verification gap — the caller (activateTenant.js) must never flip the
 * business_database_registry row to active/verified unless this function
 * resolves successfully.
 *
 * @param {{
 *   tenantSequelize: import('sequelize').Sequelize,
 *   metaSequelize: import('sequelize').Sequelize,
 *   databaseName: string,
 *   confirmDestructive?: boolean,
 *   runtimeMode: string
 * }} params
 * @returns {Promise<{ migrationsExecuted: string[], verifiedTables: string[] }>}
 */
export async function applyAndVerifyBusinessSchema({
  tenantSequelize,
  metaSequelize,
  databaseName,
  confirmDestructive = false,
  runtimeMode
}) {
  const context = tenantSequelize.getQueryInterface();

  const umzug = new Umzug({
    migrations: buildMigrationsForKind('business', context),
    context,
    storage: new MetaSequelizeStorage({ sequelize: metaSequelize, targetDatabase: databaseName }),
    logger: undefined
  });

  const pending = await umzug.pending();

  // T-04-09-02: reuse the runner's pending-only destructive gate. Today's
  // business-foundation + staff-invitations migrations are additive
  // (meta.destructive is not true), so this is a no-op — but wiring it here
  // means a future destructive business migration correctly requires
  // --confirm-destructive, matching D-09/D-17.
  assertDestructiveAllowed({
    isDestructive: pending.some((migration) => migration.meta?.destructive === true),
    confirmDestructive,
    runtimeMode
  });

  const executed = await umzug.up();

  const expectedTables = Object.keys(dgfyBusinessContract.tables);
  const rawTables = await context.showAllTables();
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

  return {
    migrationsExecuted: executed.map((migration) => migration.name),
    verifiedTables: expectedTables
  };
}

export default { applyAndVerifyBusinessSchema };
