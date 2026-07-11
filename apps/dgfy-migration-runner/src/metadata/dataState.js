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
