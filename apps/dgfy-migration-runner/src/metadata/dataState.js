import {
    LEGACY_ID_MAP_TABLE,
    DATA_CHECKPOINTS_TABLE,
    DATA_QUALITY_FINDINGS_TABLE
} from './bootstrap.js';

/**
 * Plan 03 (D-02/D-03/D-04, T-03-01-02): dgfy_migration_meta helpers for the
 * durable legacy-to-DGFY ID map, per (tenant, entity type) checkpoints, and
 * data-quality findings. Every SQL statement here uses Sequelize
 * `replacements` — never string-interpolated values — per the threat model's
 * SQL-injection mitigation for `dataState.js`.
 */

function toKeyString(value) {
    return value === undefined || value === null ? null : String(value);
}

/**
 * Looks up an existing legacy_id_map row scoped by
 * (run_scope, legacy_source, legacy_table, legacy_id).
 */
export async function findLegacyIdMap(metaSequelize, { runScope, legacySource, legacyTable, legacyId }) {
    const [rows] = await metaSequelize.query(
        `SELECT * FROM ${LEGACY_ID_MAP_TABLE} WHERE run_scope = ? AND legacy_source = ? AND legacy_table = ? AND legacy_id = ? LIMIT 1`,
        { replacements: [runScope, legacySource, legacyTable, toKeyString(legacyId)] }
    );
    return rows[0] || null;
}

/**
 * Idempotent lookup-before-insert (D-02/D-04, Pitfall 3): looks up the map
 * row first so a retried apply never creates a second legacy_id_map row for
 * the same (run_scope, legacy_source, legacy_table, legacy_id) scope.
 */
export async function recordLegacyIdMap(metaSequelize, {
    runScope,
    legacySource,
    legacyTable,
    legacyId,
    dgfyDatabase,
    dgfyTable,
    dgfyId
}) {
    const existing = await findLegacyIdMap(metaSequelize, { runScope, legacySource, legacyTable, legacyId });
    if (existing) {
        return existing;
    }

    await metaSequelize.getQueryInterface().bulkInsert(LEGACY_ID_MAP_TABLE, [{
        run_scope: runScope,
        legacy_source: legacySource,
        legacy_table: legacyTable,
        legacy_id: toKeyString(legacyId),
        dgfy_database: dgfyDatabase,
        dgfy_table: dgfyTable,
        dgfy_id: toKeyString(dgfyId),
        mapped_at: new Date()
    }]);

    return findLegacyIdMap(metaSequelize, { runScope, legacySource, legacyTable, legacyId });
}

/**
 * Looks up the per-(tenant, entity type) checkpoint row (D-03) for the given
 * run scope.
 */
export async function getDataCheckpoint(metaSequelize, { runScope, legacyTenantId, entityType }) {
    const [rows] = await metaSequelize.query(
        `SELECT * FROM ${DATA_CHECKPOINTS_TABLE} WHERE run_scope = ? AND legacy_tenant_id = ? AND entity_type = ? LIMIT 1`,
        { replacements: [runScope, legacyTenantId, entityType] }
    );
    return rows[0] || null;
}

/**
 * Upserts the (run_scope, legacy_tenant_id, entity_type) checkpoint row:
 * creates it on first use, updates status/progress on later calls, and never
 * creates a second row for the same scope (D-03/D-04, Pitfall 3 — retry
 * duplicates).
 */
export async function markDataCheckpoint(metaSequelize, {
    runScope,
    legacyTenantId,
    entityType,
    dgfyDatabase = null,
    status = 'in_progress',
    lastProcessedLegacyId = null,
    recordsProcessed = 0
}) {
    const existing = await getDataCheckpoint(metaSequelize, { runScope, legacyTenantId, entityType });

    if (!existing) {
        await metaSequelize.getQueryInterface().bulkInsert(DATA_CHECKPOINTS_TABLE, [{
            run_scope: runScope,
            legacy_tenant_id: legacyTenantId,
            entity_type: entityType,
            dgfy_database: dgfyDatabase,
            status,
            last_processed_legacy_id: toKeyString(lastProcessedLegacyId),
            records_processed: recordsProcessed,
            updated_at: new Date()
        }]);

        return getDataCheckpoint(metaSequelize, { runScope, legacyTenantId, entityType });
    }

    await metaSequelize.getQueryInterface().bulkUpdate(
        DATA_CHECKPOINTS_TABLE,
        {
            status,
            dgfy_database: dgfyDatabase || existing.dgfy_database || null,
            last_processed_legacy_id: lastProcessedLegacyId !== null
                ? toKeyString(lastProcessedLegacyId)
                : existing.last_processed_legacy_id,
            records_processed: recordsProcessed,
            updated_at: new Date()
        },
        { run_scope: runScope, legacy_tenant_id: legacyTenantId, entity_type: entityType }
    );

    return getDataCheckpoint(metaSequelize, { runScope, legacyTenantId, entityType });
}

/**
 * Looks up every existing finding row (open or resolved) for one exact
 * source record — the full tuple excluding reason_code — so callers can
 * decide per-reason whether to insert, reopen, leave alone, or resolve.
 * Uses MySQL's null-safe `<=>` so an unset `legacy_tenant_id`/`legacy_table`/
 * `legacy_id` still matches other rows recorded with the same null scope
 * (plain `=` never matches NULL).
 */
async function listDataQualityFindingsForRecord(metaSequelize, {
    runScope,
    legacyTenantId = null,
    entityType,
    legacyTable = null,
    legacyId = null
}) {
    const [rows] = await metaSequelize.query(
        `SELECT * FROM ${DATA_QUALITY_FINDINGS_TABLE} WHERE run_scope = ? AND entity_type = ? AND legacy_table <=> ? AND legacy_id <=> ? AND legacy_tenant_id <=> ? ORDER BY id ASC`,
        { replacements: [runScope, entityType, legacyTable, toKeyString(legacyId), legacyTenantId] }
    );
    return rows;
}

/**
 * Reopens a specific resolved finding row in place (by id) rather than
 * inserting a second row for the same (run_scope, tenant, entity, table,
 * id, reason_code) tuple.
 */
async function reopenDataQualityFinding(metaSequelize, { id, severity, message, remediation }) {
    await metaSequelize.getQueryInterface().bulkUpdate(
        DATA_QUALITY_FINDINGS_TABLE,
        { status: 'open', severity, message, remediation: remediation ?? null },
        { id }
    );
}

/**
 * Persists a skip/conflict/orphan data-quality finding (D-04): every issue
 * is recorded here, never silently dropped from the migration report
 * (MIG-02/MIG-03/MIG-05).
 */
export async function recordDataQualityFinding(metaSequelize, {
    runScope,
    legacyTenantId = null,
    entityType,
    legacyTable = null,
    legacyId = null,
    severity,
    reasonCode,
    message,
    remediation = null
}) {
    await metaSequelize.getQueryInterface().bulkInsert(DATA_QUALITY_FINDINGS_TABLE, [{
        run_scope: runScope,
        legacy_tenant_id: legacyTenantId,
        entity_type: entityType,
        legacy_table: legacyTable,
        legacy_id: toKeyString(legacyId),
        severity,
        reason_code: reasonCode,
        message,
        remediation,
        status: 'open',
        created_at: new Date()
    }]);
}

/**
 * Marks previously-open findings resolved once apply has successfully
 * inserted/reconciled the exact legacy entity they referred to. This closes
 * first-pass dry-run orphan findings for dependency-ordered entities without
 * weakening verification's "open findings fail" contract.
 */
export async function resolveDataQualityFindings(metaSequelize, {
    runScope,
    legacyTenantId = null,
    entityType,
    legacyTable = null,
    legacyId = null,
    reasonCode
}) {
    const where = {
        run_scope: runScope,
        status: 'open',
        entity_type: entityType
    };

    if (legacyTenantId !== undefined) {
        where.legacy_tenant_id = legacyTenantId;
    }
    if (legacyTable !== undefined) {
        where.legacy_table = legacyTable;
    }
    if (legacyId !== undefined) {
        where.legacy_id = toKeyString(legacyId);
    }
    // Selective resolution (Plan 03): only scope by reason_code when the
    // caller passes one. Existing callers that don't pass it keep the prior
    // blanket-by-record behavior; syncDataQualityFindings always passes it.
    if (reasonCode !== undefined) {
        where.reason_code = reasonCode;
    }

    await metaSequelize.getQueryInterface().bulkUpdate(
        DATA_QUALITY_FINDINGS_TABLE,
        { status: 'resolved' },
        where
    );
}

/**
 * Synchronizes data-quality findings for one exact source record
 * (run_scope, legacy_tenant_id, entity_type, legacy_table, legacy_id) with
 * the mapper's current output, identified by the full tuple including
 * `reason_code` (Plan 03, T-14-03-01/T-14-03-02/T-14-03-03):
 *
 * - A reason the mapper still emits and that is already open is left as-is
 *   (repeated sync of the same open reason never inserts a duplicate row).
 * - A reason the mapper emits again after it was previously resolved is
 *   reopened in place (a retry can never turn a still-present finding into
 *   false-clean evidence).
 * - A reason the mapper emits for the first time is inserted as a new open
 *   finding.
 * - A reason that was open but is absent from the current mapper output is
 *   resolved — and only that reason; every other reason still open for the
 *   same source record, or open under a different run/tenant/entity scope,
 *   is left untouched (selective resolution, not blanket resolution).
 * - Batch checkpoint completion state is never consulted here: callers must
 *   invoke this on every scan, not only on batches that have not yet been
 *   marked `completed` (checkpoint state must never suppress synchronizing
 *   current mapper output into finding rows).
 *
 * @param {{
 *   metaSequelize: import('sequelize').Sequelize,
 *   runScope: string,
 *   legacyTenantId?: string|null,
 *   entityType: string,
 *   legacyTable?: string|null,
 *   legacyId?: string|number|null,
 *   findings?: Array<{ severity: string, reasonCode: string, message: string, remediation?: string|null }>
 * }} params
 */
export async function syncDataQualityFindings(metaSequelize, {
    runScope,
    legacyTenantId = null,
    entityType,
    legacyTable = null,
    legacyId = null,
    findings = []
}) {
    const normalizedLegacyId = toKeyString(legacyId);
    const currentReasonCodes = new Set(findings.map((finding) => finding.reasonCode));

    const existingRows = await listDataQualityFindingsForRecord(metaSequelize, {
        runScope, legacyTenantId, entityType, legacyTable, legacyId: normalizedLegacyId
    });
    const existingByReason = new Map(existingRows.map((row) => [row.reason_code, row]));

    for (const finding of findings) {
        const existing = existingByReason.get(finding.reasonCode);

        if (!existing) {
            // eslint-disable-next-line no-await-in-loop
            await recordDataQualityFinding(metaSequelize, {
                runScope,
                legacyTenantId,
                entityType,
                legacyTable,
                legacyId: normalizedLegacyId,
                severity: finding.severity,
                reasonCode: finding.reasonCode,
                message: finding.message,
                remediation: finding.remediation ?? null
            });
            continue; // eslint-disable-line no-continue
        }

        if (existing.status === 'open') {
            continue; // eslint-disable-line no-continue
        }

        // eslint-disable-next-line no-await-in-loop
        await reopenDataQualityFinding(metaSequelize, {
            id: existing.id,
            severity: finding.severity,
            message: finding.message,
            remediation: finding.remediation ?? null
        });
    }

    const reasonsToResolve = existingRows
        .filter((row) => row.status === 'open' && !currentReasonCodes.has(row.reason_code))
        .map((row) => row.reason_code);

    for (const reasonCode of reasonsToResolve) {
        // eslint-disable-next-line no-await-in-loop
        await resolveDataQualityFindings(metaSequelize, {
            runScope, legacyTenantId, entityType, legacyTable, legacyId: normalizedLegacyId, reasonCode
        });
    }
}

/**
 * Lists unresolved data-quality findings for a run scope — MIG-05
 * verification evidence.
 */
export async function listOpenDataQualityFindings(metaSequelize, { runScope }) {
    const [rows] = await metaSequelize.query(
        `SELECT * FROM ${DATA_QUALITY_FINDINGS_TABLE} WHERE run_scope = ? AND status = ? ORDER BY id ASC`,
        { replacements: [runScope, 'open'] }
    );
    return rows;
}
