import { validateEnv, BUSINESS_DB_NAME_PATTERN } from '../config/env.js';
import {
  createTargetConnection,
  createMetaConnection,
  createBusinessTargetConnection
} from '../config/db.js';
import { assertTargetDbNameAllowed } from '../safety/targetGuard.js';
import { ensureMetadataSchema, recordCommandStart, recordCommandComplete } from '../metadata/bootstrap.js';
import { writeJsonReport } from '../reports/reportWriter.js';
import { writeSummaryReport } from '../reports/summaryWriter.js';
import { EnvValidationError, TargetGuardError } from '../utils/errors.js';
import { applyAndVerifyBusinessSchema } from '../schema/applyBusinessSchema.js';

/**
 * F-05/F-06 fix (04-REVIEW.md WR-03/WR-05): shared report-build/write/record
 * finisher for BOTH the idempotent no-op branch and the main activation
 * branch of runActivateTenant — previously duplicated near-verbatim between
 * them (WR-05), and previously recorded exitStatus:'failed' if report/
 * summary writing threw AFTER the real mutation (registry UPDATE, or the
 * idempotent re-verify) had already durably succeeded (WR-03) — an operator
 * would see "fatal" and might needlessly re-run/escalate an activation that
 * had, in fact, already completed. By the time this helper is called, the
 * activation-relevant work is already done; report/summary writing here is
 * best-effort observability only and must never flip a genuinely successful
 * activation to `failed` (mirrors verify.js's own reportWriteError
 * best-effort pattern for the identical class of "post-success bookkeeping
 * failure" problem).
 * @param {{config, executionId, metaSequelize, databaseName, registryRow, migrationsExecuted, verifiedTables, alreadyActive, generatedAt}} params
 * @returns {Promise<Object>} the report object
 */
async function finishActivation({
  config, executionId, metaSequelize, databaseName, registryRow,
  migrationsExecuted, verifiedTables, alreadyActive, generatedAt
}) {
  const report = {
    generated_at: generatedAt,
    command: 'activate-tenant',
    // T-04-09-04: database names, business_id, migration names, and
    // verified tables only — never DB host/user/password/DSN or tokens.
    database_name: databaseName,
    business_id: registryRow.business_id,
    migrations_executed: migrationsExecuted,
    verified_tables: verifiedTables,
    activated: true,
    already_active: alreadyActive
  };

  let reportJsonPath = null;
  let reportSummaryPath = null;
  try {
    reportJsonPath = await writeJsonReport(config.reportDir, 'activate-tenant', report);
    reportSummaryPath = await writeSummaryReport(config.reportDir, 'activate-tenant', report, 'success');
  } catch (error) {
    // Best-effort logging only (WR-03) — the activation itself already
    // succeeded, so this must never surface as a command failure. Still
    // surfaced to the operator via stderr rather than silently swallowed.
    // eslint-disable-next-line no-console
    console.error(
      `activate-tenant: report/summary write failed after a successful activation of "${databaseName}" `
      + `(exit_status remains 'success'): ${error.message}`
    );
  }

  try {
    await recordCommandComplete(metaSequelize, executionId, {
      exitStatus: 'success',
      reportJsonPath,
      reportSummaryPath
    });
  } catch (error) {
    // Best-effort audit bookkeeping — must not crash after a genuinely
    // successful activation.
    // eslint-disable-next-line no-console
    console.error(`activate-tenant: recordCommandComplete failed after a successful activation: ${error.message}`);
  }

  return report;
}

/**
 * 04-09 gap closure (API-02/API-03): operator-invokable activation handoff.
 * Reproduces, in shipped production code, exactly what the proven test
 * helper apps/dgfy-api/tests/helpers/tenantSchemaProvisioning.js already
 * proves works — resolve the EXISTING `provisioning`
 * business_database_registry row for `databaseName` (never create a second
 * row), apply + verify the real tenant schema, then flip the row to
 * active/verified via a direct, contract-faithful UPDATE keyed on the
 * unique `database_name`.
 *
 * Mirrors the validate -> guard -> connect -> record -> report shape of
 * runSchemaMigrate/runStatus.
 *
 * @param {{ databaseName: string, confirmDestructive?: boolean }} params
 */
export async function runActivateTenant({ databaseName, confirmDestructive = false }) {
  const { valid, errors, config } = validateEnv();
  if (!valid) {
    throw new EnvValidationError(errors.join('; '));
  }

  // T-04-09-01: guard the requested databaseName with BOTH the generic
  // dgfy_ pattern AND an explicit business-only pattern check, before any
  // connection is opened. This prevents activating dgfy_core or any
  // unintended/non-business database.
  assertTargetDbNameAllowed(databaseName, config.runtimeMode);
  if (!BUSINESS_DB_NAME_PATTERN.test(databaseName)) {
    throw new TargetGuardError(
      `activate-tenant refuses non-business database_name "${databaseName}" — must match ${BUSINESS_DB_NAME_PATTERN}`
    );
  }

  const coreSequelize = createTargetConnection(config);
  const metaSequelize = createMetaConnection(config);
  await ensureMetadataSchema(metaSequelize);

  let executionId;
  try {
    executionId = await recordCommandStart(metaSequelize, {
      command: 'activate-tenant',
      mode: 'activate',
      argsJson: JSON.stringify({ databaseName, confirmDestructive }),
      actor: config.actor,
      runtimeMode: config.runtimeMode
    });

    // T-04-09-03: resolve the EXISTING registry row (never INSERT). Fail
    // closed when no row exists — the business must first be created via
    // POST /businesses (findOrCreateForBusiness), which is what seeds the
    // `provisioning` row this command activates.
    const [rows] = await coreSequelize.query(
      'SELECT business_id, database_name, status, verified_at FROM business_database_registry WHERE database_name = ?',
      { replacements: [databaseName] }
    );
    const registryRow = Array.isArray(rows) ? rows[0] : rows;

    if (!registryRow) {
      throw new Error(
        `activate-tenant: no business_database_registry row exists for database_name "${databaseName}" — `
        + 'the business must first be created via POST /businesses before it can be activated.'
      );
    }

    // WR-01 (04-REVIEW.md): the only guard before this point was
    // `!registryRow` (fail closed on a missing row). Any row that exists
    // but is not in a legitimate pre-activation state (e.g. a
    // `deprecated`/`migrating` row from a future admin transition) must not
    // be silently resurrected to `active` just because it exists. Require
    // status === 'provisioning' for every path except the idempotent
    // already-active/verified no-op below.
    if (!(registryRow.status === 'active' && registryRow.verified_at) && registryRow.status !== 'provisioning') {
      throw new TargetGuardError(
        `activate-tenant refuses to activate database_name "${databaseName}" — registry status is `
        + `"${registryRow.status}", expected "provisioning" (or already-active/verified for a no-op).`
      );
    }

    // Idempotency: if already active/verified, re-confirm the schema still
    // satisfies the contract and report a safe no-op rather than issuing a
    // second UPDATE.
    if (registryRow.status === 'active' && registryRow.verified_at) {
      const tenantSequelize = createBusinessTargetConnection(config, databaseName);
      const { migrationsExecuted, verifiedTables } = await applyAndVerifyBusinessSchema({
        tenantSequelize,
        metaSequelize,
        databaseName,
        confirmDestructive,
        runtimeMode: config.runtimeMode
      });

      return await finishActivation({
        config,
        executionId,
        metaSequelize,
        databaseName,
        registryRow,
        migrationsExecuted,
        verifiedTables,
        alreadyActive: true,
        generatedAt: new Date().toISOString()
      });
    }

    // Ensure the physical tenant database exists — databaseName was already
    // guarded to match BUSINESS_DB_NAME_PATTERN above, so it is safe to
    // interpolate.
    await coreSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\``);

    const tenantSequelize = createBusinessTargetConnection(config, databaseName);
    const { migrationsExecuted, verifiedTables } = await applyAndVerifyBusinessSchema({
      tenantSequelize,
      metaSequelize,
      databaseName,
      confirmDestructive,
      runtimeMode: config.runtimeMode
    });

    // T-04-09-03: flip the registry ONLY after schema verification succeeds,
    // keyed on the unique database_name (never business_id, which lacks a
    // unique constraint) — these are exactly the columns updateStatus()
    // writes.
    const now = new Date();
    await coreSequelize.query(
      'UPDATE business_database_registry SET status = ?, verified_at = ?, updated_at = ? WHERE database_name = ?',
      { replacements: ['active', now, now, databaseName] }
    );

    return await finishActivation({
      config,
      executionId,
      metaSequelize,
      databaseName,
      registryRow,
      migrationsExecuted,
      verifiedTables,
      alreadyActive: false,
      generatedAt: now.toISOString()
    });
  } catch (error) {
    // executionId can legitimately be 0 — do not treat it as falsy (WR-02).
    if (executionId !== undefined && executionId !== null) {
      await recordCommandComplete(metaSequelize, executionId, {
        exitStatus: 'failed',
        errorMessage: error.message
      });
    }
    throw error;
  }
}

export default { runActivateTenant };
