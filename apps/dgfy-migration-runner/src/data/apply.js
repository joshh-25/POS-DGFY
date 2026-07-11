/**
 * Phase 03 Plan 04 (MIG-03, MIG-04, T-03-04-01): checkpointed, ID-mapped
 * destructive apply service.
 *
 * This is the highest-risk Phase 03 component — the only code path that
 * writes to `dgfy_*` target databases. It calls the exact same pure mapper
 * functions dry-run (03-03) uses (`src/data/mappings.js`), so mapping/skip/
 * conflict decisions can never drift between dry-run and apply
 * (03-RESEARCH.md Pitfall 2), while adding the write-time contract dry-run
 * never needed:
 *
 * - **Lookup-before-insert (D-02):** every insert/update candidate is first
 *   checked against the durable `legacy_id_map` (metadata/dataState.js). If
 *   a map row exists, the target write is never repeated — the mapped
 *   `dgfy_id` is reused directly (after a lightweight existence check,
 *   `assertMappedTargetIdentity()`).
 * - **Target-first, natural-key reconciliation:** because the target
 *   database and `dgfy_migration_meta` are two separate MySQL connections
 *   (Sequelize per-database, no cross-database transaction is possible —
 *   03-RESEARCH.md Pattern 2), a crash between "target row written" and
 *   "map row recorded" is a real interruption point (T-03-04-03). Before
 *   inserting, every write also checks the target table's own natural
 *   unique key (email, terminal_code, database_name, ...) for a row that
 *   was already durably written in a prior interrupted run — reconciling
 *   instead of duplicating, then recording the map row on top of the
 *   already-existing target row.
 * - **Per-(tenant, entity type) checkpoints (D-03):** `applyTenantEntityBatch()`
 *   only marks a checkpoint `completed` after every entry in that batch has
 *   been durably written/reconciled and mapped. A batch whose checkpoint is
 *   already `completed` is re-verified (assertMappedTargetIdentity per
 *   mapped row) rather than re-written.
 * - **Skip/conflict findings are always persisted (D-04):** every mapper
 *   `skip`/`conflict` result's findings are recorded via
 *   `recordDataQualityFinding()` exactly once, on the pass that actually
 *   processed the batch (not re-recorded on a checkpoint-verify pass).
 * - **Reference relationships use resolved DGFY ids, never legacy raw ids
 *   (MIG-04):** `account_staff_assignment.staff_account_id` and
 *   `terminal_identity.location_id` are always resolved by looking up the
 *   already-durable `legacy_id_map` row for the dependency (staff account /
 *   location) — whether that dependency was written moments earlier in this
 *   same run, or in a prior completed run — never a legacy tenant-local id.
 *
 * Entity write order per tenant (mirrors dryRun.js's buildDryRunPlan() order
 * exactly, per 03-03's Next Phase Readiness note): account (landlord-scoped,
 * once) -> business (+ business_database_registry + tenant_ownership_metadata
 * related writes) -> staff_account -> business_membership ->
 * account_staff_assignment -> location -> terminal_identity. staff accounts
 * must be written before assignments, and locations before terminals, so
 * their dependents can resolve a real mapped id within the same run.
 */

import {
    createSourceConnection,
    createLegacyTenantSourceConnection,
    createBusinessTargetConnection
} from '../config/db.js';
import { DEFAULT_RUN_SCOPE } from './dryRun.js';
import { readLegacyLandlordSnapshot, readLegacyTenantSnapshot } from './legacySource.js';
import {
    mapLegacyAccountToDgfyAccount,
    mapLegacyTenantToBusiness,
    mapLegacyMembershipToBusinessMembership,
    mapLegacyUserToStaffAccount,
    mapLegacyAccountStaffAssignment,
    mapLegacyLocationToLocation,
    mapTerminalRegistryEntryToTerminalIdentity,
    classifyMappingConflict,
    MAPPING_REASON_CODES
} from './mappings.js';
import {
    findLegacyIdMap,
    recordLegacyIdMap,
    getDataCheckpoint,
    markDataCheckpoint,
    recordDataQualityFinding,
    resolveDataQualityFindings
} from '../metadata/dataState.js';

export { DEFAULT_RUN_SCOPE };

// A non-null legacy_tenant_id scope for the landlord-level `account` entity
// type — dgfy_core.accounts are migrated once for the whole run (not
// per-tenant), but data_checkpoints.legacy_tenant_id is NOT NULL, so a
// stable sentinel scope is used instead of a real legacy_tenant_id.
const LANDLORD_CHECKPOINT_SCOPE = 'landlord';

/**
 * Natural-key idempotency contract per entity type: the target table each
 * entity type writes to, its primary key column, and the column(s) that
 * form a real (or, for `location`, best-effort) natural key a retried apply
 * can use to detect an already-written row when the durable `legacy_id_map`
 * row itself has not been recorded yet (target-first interruption point).
 *
 * Every column here matches a real unique constraint from
 * `dgfyCoreContract.js`/`dgfyBusinessContract.js` EXCEPT `location`, which
 * has no unique constraint in the Phase 02 schema — `name` is used as a
 * best-effort de-dup key. This is a documented limitation (see
 * 03-04-SUMMARY.md): two legacy locations sharing an identical name within
 * one tenant would be incorrectly treated as "already migrated" on retry.
 */
const ENTITY_TARGET_CONFIG = {
    account: { primaryKey: 'id', naturalKeyColumns: ['id'] },
    business: { primaryKey: 'id', naturalKeyColumns: ['id'] },
    business_database_registry: { primaryKey: 'id', naturalKeyColumns: ['database_name'] },
    tenant_ownership_metadata: { primaryKey: 'id', naturalKeyColumns: ['business_id'] },
    business_membership: { primaryKey: 'id', naturalKeyColumns: ['business_id', 'account_id'] },
    staff_account: { primaryKey: 'id', naturalKeyColumns: ['email'] },
    account_staff_assignment: { primaryKey: 'id', naturalKeyColumns: ['dgfy_account_id'] },
    location: { primaryKey: 'id', naturalKeyColumns: ['name'] },
    terminal_identity: { primaryKey: 'id', naturalKeyColumns: ['terminal_code'] }
};

/**
 * Checks whether a target row still exists for a previously-recorded
 * `legacy_id_map.dgfy_id` (Task 1 acceptance: "if complete, verify mapped
 * target rows still match"). Read-only — a single parameterized `SELECT`,
 * never string-interpolated values.
 *
 * @param {import('sequelize').Sequelize} targetSequelize
 * @param {{ table: string, primaryKeyColumn?: string, dgfyId: string|number }} params
 */
export async function assertMappedTargetIdentity(targetSequelize, { table, primaryKeyColumn = 'id', dgfyId }) {
    if (dgfyId === undefined || dgfyId === null) {
        return false;
    }
    const [rows] = await targetSequelize.query(
        `SELECT ${primaryKeyColumn} FROM ${table} WHERE ${primaryKeyColumn} = ? LIMIT 1`,
        { replacements: [dgfyId] }
    );
    return Array.isArray(rows) && rows.length > 0;
}

/**
 * Natural-key lookup against the target table — the target-first
 * reconciliation path used when no durable `legacy_id_map` row exists yet.
 * Returns null (never throws) when the entity type has no natural-key
 * config or any natural-key column is missing from `payload`.
 */
async function findExistingTargetRow(targetSequelize, table, config, payload) {
    if (!config) {
        return null;
    }
    const values = config.naturalKeyColumns.map((column) => payload?.[column]);
    if (values.some((value) => value === undefined || value === null)) {
        return null;
    }
    const whereClause = config.naturalKeyColumns.map((column) => `${column} = ?`).join(' AND ');
    const [rows] = await targetSequelize.query(
        `SELECT * FROM ${table} WHERE ${whereClause} LIMIT 1`,
        { replacements: values }
    );
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * Inserts a single target row. Tables whose mapper already assigns a
 * deterministic `id` (accounts, businesses) use that id directly. Every
 * other table relies on MySQL AUTO_INCREMENT — `LAST_INSERT_ID()` is
 * fetched inside the same `targetSequelize.transaction()` as the insert
 * (mirrors metadata/bootstrap.js's `recordCommandStart()` pattern) so the
 * SELECT is pinned to the exact pooled connection the INSERT ran on, never
 * racing a different connection's own last-insert value.
 */
async function insertTargetRow(targetSequelize, table, payload) {
    const row = { ...payload, created_at: new Date(), updated_at: new Date() };

    if (row.id !== undefined && row.id !== null) {
        await targetSequelize.getQueryInterface().bulkInsert(table, [row]);
        return row.id;
    }

    return targetSequelize.transaction(async (transaction) => {
        await targetSequelize.getQueryInterface().bulkInsert(table, [row], { transaction });
        const [rows] = await targetSequelize.query('SELECT LAST_INSERT_ID() AS id', { transaction });
        const resultRow = Array.isArray(rows) ? rows[0] : rows;
        return resultRow ? resultRow.id : null;
    });
}

/**
 * Writes (or reconciles) a related target row — `business_database_registry`
 * and `tenant_ownership_metadata` — that is derived 1:1 from the same
 * `mapLegacyTenantToBusiness()` call as the parent `business` entry. These
 * do not get their own `legacy_id_map` row (they share the parent business's
 * legacy record and each already has a real target-side unique constraint —
 * `database_name` / `business_id`); idempotency comes entirely from the
 * natural-key lookup-before-insert below.
 */
async function writeRelatedTargetRow(targetSequelize, related) {
    const config = ENTITY_TARGET_CONFIG[related.entity_type];
    const existing = await findExistingTargetRow(targetSequelize, related.target_table, config, related.target_payload);
    if (existing) {
        return existing[config.primaryKey];
    }
    return insertTargetRow(targetSequelize, related.target_table, related.target_payload);
}

/**
 * The core lookup-before-insert write contract (T-03-04-01, D-02). For a
 * `skip`/`conflict` mapper result, returns immediately with no DB call — the
 * caller is responsible for persisting the entry's findings. For an
 * `insert`/`update` result:
 *
 * 1. If a durable `legacy_id_map` row already exists for this record, no
 *    target write happens at all; `assertMappedTargetIdentity()` verifies
 *    the mapped row still exists (recording a drift finding if not) and the
 *    existing `dgfy_id` is returned as `reconciled`.
 * 2. Otherwise, the target table's natural key is checked for an
 *    already-written row (target-first interruption point — the target
 *    write succeeded in a prior run but the map row was never recorded).
 *    If found, that row's id is reused as `reconciled` and the map row is
 *    recorded now.
 * 3. Otherwise, the target row is inserted (`insertTargetRow()`) and the map
 *    row is recorded — `inserted`.
 *
 * **Fan-out disambiguation:** `business_membership` and
 * `account_staff_assignment` both derive their `legacy_id_map_key` from the
 * exact same legacy `dgfy_account_tenant_memberships` row (per
 * `mappings.js`/the mapping doc), but write to two different target tables.
 * `legacy_id_map`'s unique index (03-01, `metadata/bootstrap.js`) is
 * `(run_scope, legacy_source, legacy_table, legacy_id)` only — it cannot
 * hold two rows for one source key. When the map row found under the
 * original key belongs to a *different* target table than this entry's own
 * `target_table`, this function transparently looks up (and later records)
 * this entity's own row under a disambiguated key
 * (`legacy_id` + `::` + `target_table`) instead — `legacy_source`/
 * `legacy_table` stay exactly as documented in
 * `docs/database/dgfy-data-migration-map.md`, only `legacy_id` gains the
 * suffix, and only for the entity that would otherwise collide.
 *
 * @param {{ metaSequelize: import('sequelize').Sequelize, targetSequelize: import('sequelize').Sequelize, runScope: string, entry: object }} params
 * @returns {Promise<{ status: 'skip'|'conflict'|'inserted'|'reconciled', dgfyId: string|number|null }>}
 */
export async function writeMappedTargetRow({ metaSequelize, targetSequelize, runScope, entry }) {
    if (entry.operation !== 'insert' && entry.operation !== 'update') {
        return { status: entry.operation, dgfyId: null };
    }

    const table = entry.target_table;
    const payload = entry.target_payload;
    const config = ENTITY_TARGET_CONFIG[entry.entity_type];

    let key = entry.legacy_id_map_key;
    let existingMap = null;

    if (key) {
        existingMap = await findLegacyIdMap(metaSequelize, {
            runScope, legacySource: key.legacy_source, legacyTable: key.legacy_table, legacyId: key.legacy_id
        });

        if (existingMap && existingMap.dgfy_table !== table) {
            // Fan-out collision — a different entity type already durably
            // claimed this exact source key. Disambiguate this entity's own
            // lookup/record key (see doc comment above) and re-check.
            key = { ...key, legacy_id: `${key.legacy_id}::${table}` };
            existingMap = await findLegacyIdMap(metaSequelize, {
                runScope, legacySource: key.legacy_source, legacyTable: key.legacy_table, legacyId: key.legacy_id
            });
        }
    }

    if (existingMap) {
        if (config) {
            const stillPresent = await assertMappedTargetIdentity(targetSequelize, {
                table, primaryKeyColumn: config.primaryKey, dgfyId: existingMap.dgfy_id
            });
            if (!stillPresent) {
                await recordDataQualityFinding(metaSequelize, {
                    runScope,
                    legacyTenantId: entry.legacy_tenant_id ?? null,
                    entityType: entry.entity_type,
                    legacyTable: key.legacy_table,
                    legacyId: key.legacy_id,
                    severity: 'conflict',
                    reasonCode: 'target_row_missing_after_map',
                    message: `Durable legacy_id_map row exists for ${key.legacy_table}:${key.legacy_id} but the mapped target row no longer exists in ${table}.`,
                    remediation: 'Investigate manual deletion/drift of the target row and repair before retrying migration.'
                });
            }
        }
        return { status: 'reconciled', dgfyId: existingMap.dgfy_id };
    }

    const existingRow = config ? await findExistingTargetRow(targetSequelize, table, config, payload) : null;

    let dgfyId;
    let status;
    if (existingRow) {
        dgfyId = existingRow[config.primaryKey];
        status = 'reconciled';
    } else {
        dgfyId = await insertTargetRow(targetSequelize, table, payload);
        status = 'inserted';
    }

    if (key) {
        await recordLegacyIdMap(metaSequelize, {
            runScope,
            legacySource: key.legacy_source,
            legacyTable: key.legacy_table,
            legacyId: key.legacy_id,
            dgfyDatabase: entry.target_database,
            dgfyTable: table,
            dgfyId
        });
    }

    return { status, dgfyId };
}

/**
 * Looks up the durable (run_scope, legacy_tenant_id, entity_type) checkpoint
 * row and reports whether the batch was already durably completed.
 */
export async function resumeFromDataCheckpoint(metaSequelize, { runScope, legacyTenantId, entityType }) {
    const checkpoint = await getDataCheckpoint(metaSequelize, { runScope, legacyTenantId, entityType });
    return { checkpoint, alreadyCompleted: checkpoint?.status === 'completed' };
}

/**
 * Applies (or verifies) every plan entry for one (tenant, entity type)
 * scope, then marks the checkpoint `completed` — but only when this call
 * actually processed the batch (D-03: "mark the checkpoint only after the
 * batch's durable target and metadata writes complete"). When the
 * checkpoint is already `completed`, every entry is re-verified via
 * `writeMappedTargetRow()`'s existing-map branch (no write, no duplicate
 * finding persistence, no checkpoint re-mark) — Task 1 acceptance: "if
 * complete, verify mapped target rows still match and skip duplicate
 * writes."
 *
 * @param {{
 *   metaSequelize: import('sequelize').Sequelize,
 *   targetSequelize: import('sequelize').Sequelize,
 *   runScope: string,
 *   legacyTenantId: string,
 *   entityType: string,
 *   entries: object[],
 *   dgfyDatabase?: string|null
 * }} params
 * @returns {Promise<Array<{ entry: object, status: string, dgfyId: string|number|null }>>}
 */
export async function applyTenantEntityBatch({
    metaSequelize,
    targetSequelize,
    runScope,
    legacyTenantId,
    entityType,
    entries = [],
    dgfyDatabase = null
}) {
    const { alreadyCompleted } = await resumeFromDataCheckpoint(metaSequelize, { runScope, legacyTenantId, entityType });
    const results = [];

    for (const entry of entries) {
        // eslint-disable-next-line no-await-in-loop
        const writeResult = await writeMappedTargetRow({ metaSequelize, targetSequelize, runScope, entry });
        results.push({ entry, status: writeResult.status, dgfyId: writeResult.dgfyId });

        if ((writeResult.status === 'inserted' || writeResult.status === 'reconciled') && entry.legacy_id_map_key) {
            // eslint-disable-next-line no-await-in-loop
            await resolveDataQualityFindings(metaSequelize, {
                runScope,
                legacyTenantId: entry.legacy_tenant_id ?? legacyTenantId,
                entityType: entry.entity_type,
                legacyTable: entry.legacy_id_map_key.legacy_table,
                legacyId: entry.legacy_id_map_key.legacy_id
            });
        }

        if (!alreadyCompleted) {
            for (const finding of entry.findings || []) {
                // eslint-disable-next-line no-await-in-loop
                await recordDataQualityFinding(metaSequelize, {
                    runScope,
                    legacyTenantId: entry.legacy_tenant_id ?? legacyTenantId,
                    entityType: finding.entity_type,
                    legacyTable: finding.legacy_table,
                    legacyId: finding.legacy_id,
                    severity: finding.severity,
                    reasonCode: finding.reason_code,
                    message: finding.message,
                    remediation: finding.remediation
                });
            }
        }
    }

    if (!alreadyCompleted) {
        await markDataCheckpoint(metaSequelize, {
            runScope, legacyTenantId, entityType, dgfyDatabase, status: 'completed', recordsProcessed: entries.length
        });
    }

    return results;
}

function recordResult(summary, results, entry, status, dgfyId) {
    results.push({
        legacy_tenant_id: entry.legacy_tenant_id ?? null,
        entity_type: entry.entity_type,
        operation: entry.operation,
        status,
        target_table: entry.target_table,
        target_database: entry.target_database,
        // Deliberately no target_payload/findings text here — the apply
        // report must never carry password_hash, terminal secrets, or
        // company_token (threat model: "Secret leakage in reports").
        dgfy_id: dgfyId ?? null
    });

    if (entry.operation === 'skip') {
        summary.rows_skipped += 1;
    } else if (entry.operation === 'conflict') {
        summary.rows_conflicted += 1;
    } else if (status === 'inserted') {
        summary.rows_written += 1;
    } else if (status === 'reconciled') {
        summary.rows_retried += 1;
    }
}

async function applyBatchAndRecord({ metaSequelize, targetSequelize, runScope, legacyTenantId, entityType, entries, dgfyDatabase, summary, results }) {
    const batchResults = await applyTenantEntityBatch({
        metaSequelize, targetSequelize, runScope, legacyTenantId, entityType, entries, dgfyDatabase
    });
    batchResults.forEach(({ entry, status, dgfyId }) => recordResult(summary, results, entry, status, dgfyId));
    summary.checkpoints_marked += 1;
}

/**
 * Orchestrates a full checkpointed apply run (T-03-04-01): opens legacy
 * source connections (mirrors dryRun.js's runDryRunTransformations()), a
 * per-tenant `dgfy_business_*` target connection, writes every in-scope
 * legacy record through `writeMappedTargetRow()`/`applyTenantEntityBatch()`
 * in the fixed entity order, and returns a report-safe summary/results
 * shape (never raw `target_payload`).
 *
 * `coreSequelize` (the already-opened `dgfy_core` connection) is passed in
 * by the caller (`src/commands/data.js`) rather than opened here, since the
 * command handler must open it before this call as part of the existing
 * Phase 1 connection-ordering contract.
 *
 * @param {{
 *   config: object,
 *   metaSequelize: import('sequelize').Sequelize,
 *   coreSequelize: import('sequelize').Sequelize,
 *   targets: object[],
 *   runScope?: string
 * }} params
 */
export async function runApplyTransformations({ config, metaSequelize, coreSequelize, targets = [], runScope = DEFAULT_RUN_SCOPE }) {
    const landlordSequelize = createSourceConnection(config);
    const landlordSnapshot = await readLegacyLandlordSnapshot(landlordSequelize, targets);

    const summary = {
        rows_written: 0,
        rows_skipped: 0,
        rows_conflicted: 0,
        rows_retried: 0,
        checkpoints_marked: 0,
        tenant_coverage_count: targets.length
    };
    const results = [];

    // 1. Accounts — landlord-scoped, written once for the whole run (not
    // per tenant), mirroring buildDryRunPlan()'s account de-duplication.
    const seenAccountIds = new Set();
    const accountEntries = [];
    landlordSnapshot.accounts.forEach((account) => {
        const accountKey = String(account.id);
        if (seenAccountIds.has(accountKey)) {
            return;
        }
        seenAccountIds.add(accountKey);
        accountEntries.push({ legacy_tenant_id: null, ...mapLegacyAccountToDgfyAccount(account) });
    });

    await applyBatchAndRecord({
        metaSequelize, targetSequelize: coreSequelize, runScope,
        legacyTenantId: LANDLORD_CHECKPOINT_SCOPE, entityType: 'account',
        entries: accountEntries, dgfyDatabase: 'dgfy_core', summary, results
    });

    // 2. Per-tenant entity types, in the fixed order documented above.
    for (const target of targets) {
        const legacyTenant = landlordSnapshot.tenants.find(
            (tenant) => String(tenant.id) === String(target.legacy_tenant_id)
        );
        const targetContext = {
            targetBusinessDbName: target.target_business_db_name,
            expectedBusinessId: target.expected_business_id,
            expectedOwnerAccountId: target.expected_owner_account_id
        };

        if (!legacyTenant) {
            const finding = classifyMappingConflict(MAPPING_REASON_CODES.MISSING_REQUIRED_FIELD, {
                entityType: 'business',
                legacyTable: 'tenants',
                legacyId: target.legacy_tenant_id,
                severity: 'conflict',
                message: `Migration target manifest references legacy_tenant_id "${target.legacy_tenant_id}" which was not found in the legacy landlord tenants table.`,
                remediation: 'Verify legacy_tenant_id in the migration target manifest matches an existing legacy tenant, or remove this entry from the manifest.'
            });
            // eslint-disable-next-line no-await-in-loop
            await recordDataQualityFinding(metaSequelize, {
                runScope,
                legacyTenantId: target.legacy_tenant_id,
                entityType: finding.entity_type,
                legacyTable: finding.legacy_table,
                legacyId: finding.legacy_id,
                severity: finding.severity,
                reasonCode: finding.reason_code,
                message: finding.message,
                remediation: finding.remediation
            });
            recordResult(summary, results, {
                legacy_tenant_id: target.legacy_tenant_id,
                entity_type: 'business',
                operation: 'conflict',
                target_table: 'businesses',
                target_database: null
            }, 'conflict', null);
            continue; // eslint-disable-line no-continue
        }

        const businessSequelize = createBusinessTargetConnection(config, target.target_business_db_name);
        // eslint-disable-next-line no-await-in-loop
        const tenantSequelize = createLegacyTenantSourceConnection(config, target.legacy_tenant_db_name);
        // eslint-disable-next-line no-await-in-loop
        const tenantSnapshot = await readLegacyTenantSnapshot(tenantSequelize);

        // business (+ registry + ownership metadata related writes)
        const businessResult = mapLegacyTenantToBusiness(legacyTenant, targetContext);
        const businessEntry = { legacy_tenant_id: target.legacy_tenant_id, ...businessResult };
        // eslint-disable-next-line no-await-in-loop
        await applyBatchAndRecord({
            metaSequelize, targetSequelize: coreSequelize, runScope,
            legacyTenantId: target.legacy_tenant_id, entityType: 'business',
            entries: [businessEntry], dgfyDatabase: 'dgfy_core', summary, results
        });

        for (const related of businessResult.related_targets || []) {
            const relatedTargetSequelize = related.target_database === 'dgfy_core' ? coreSequelize : businessSequelize;
            // eslint-disable-next-line no-await-in-loop
            await writeRelatedTargetRow(relatedTargetSequelize, related);
        }

        // staff accounts — must run before assignments so a real
        // staff_accounts.id is resolvable via legacy_id_map below.
        const seenStaffEmails = new Set();
        const staffEntries = tenantSnapshot.users.map((user) => {
            const staffResult = mapLegacyUserToStaffAccount(user, {
                legacyTenantDbName: target.legacy_tenant_db_name,
                targetBusinessDbName: target.target_business_db_name,
                seenEmails: seenStaffEmails
            });
            if (staffResult.operation === 'insert') {
                const normalizedEmail = String(user.email || '').trim().toLowerCase();
                if (normalizedEmail) {
                    seenStaffEmails.add(normalizedEmail);
                }
            }
            return { legacy_tenant_id: target.legacy_tenant_id, ...staffResult };
        });
        // eslint-disable-next-line no-await-in-loop
        await applyBatchAndRecord({
            metaSequelize, targetSequelize: businessSequelize, runScope,
            legacyTenantId: target.legacy_tenant_id, entityType: 'staff_account',
            entries: staffEntries, dgfyDatabase: target.target_business_db_name, summary, results
        });

        // business_membership
        const tenantMemberships = landlordSnapshot.memberships.filter(
            (membership) => String(membership.tenant_id) === String(target.legacy_tenant_id)
        );
        const membershipEntries = tenantMemberships.map((membership) => ({
            legacy_tenant_id: target.legacy_tenant_id,
            ...mapLegacyMembershipToBusinessMembership(membership, targetContext)
        }));
        // eslint-disable-next-line no-await-in-loop
        await applyBatchAndRecord({
            metaSequelize, targetSequelize: coreSequelize, runScope,
            legacyTenantId: target.legacy_tenant_id, entityType: 'business_membership',
            entries: membershipEntries, dgfyDatabase: 'dgfy_core', summary, results
        });

        // account_staff_assignment — resolves staffAccountId via the
        // durable legacy_id_map (works whether staff_account was written
        // moments ago in this same run or in a prior completed run; never a
        // raw legacy tenant_user_id, MIG-04).
        const assignmentEntries = [];
        for (const membership of tenantMemberships) {
            let staffAccountId = null;
            if (membership.tenant_user_id) {
                // eslint-disable-next-line no-await-in-loop
                const staffMap = await findLegacyIdMap(metaSequelize, {
                    runScope, legacySource: target.legacy_tenant_db_name, legacyTable: 'users', legacyId: membership.tenant_user_id
                });
                // account_staff_assignments.staff_account_id is INTEGER
                // (auto-increment target id) — legacy_id_map.dgfy_id is
                // stored as a string (metadata/dataState.js's
                // toKeyString()), so it is coerced back to a number here to
                // match the real column type/schema.
                staffAccountId = staffMap ? Number(staffMap.dgfy_id) : null;
            }
            const assignmentResult = mapLegacyAccountStaffAssignment(membership, {
                staffAccountId, targetBusinessDbName: target.target_business_db_name
            });
            assignmentEntries.push({ legacy_tenant_id: target.legacy_tenant_id, ...assignmentResult });
        }
        // eslint-disable-next-line no-await-in-loop
        await applyBatchAndRecord({
            metaSequelize, targetSequelize: businessSequelize, runScope,
            legacyTenantId: target.legacy_tenant_id, entityType: 'account_staff_assignment',
            entries: assignmentEntries, dgfyDatabase: target.target_business_db_name, summary, results
        });

        // locations — must run before terminals for the same reason staff
        // must run before assignments.
        const locationEntries = tenantSnapshot.locations.map((location) => ({
            legacy_tenant_id: target.legacy_tenant_id,
            ...mapLegacyLocationToLocation(location, {
                legacyTenantDbName: target.legacy_tenant_db_name,
                targetBusinessDbName: target.target_business_db_name
            })
        }));
        // eslint-disable-next-line no-await-in-loop
        await applyBatchAndRecord({
            metaSequelize, targetSequelize: businessSequelize, runScope,
            legacyTenantId: target.legacy_tenant_id, entityType: 'location',
            entries: locationEntries, dgfyDatabase: target.target_business_db_name, summary, results
        });

        // terminal identities — resolves location_id via the durable
        // legacy_id_map, never a raw legacy location_id (MIG-04).
        const terminalEntries = [];
        for (const entry of tenantSnapshot.terminalRegistry) {
            let locationId = null;
            if (entry.location_id) {
                // eslint-disable-next-line no-await-in-loop
                const locationMap = await findLegacyIdMap(metaSequelize, {
                    runScope, legacySource: target.legacy_tenant_db_name, legacyTable: 'tenant_locations', legacyId: entry.location_id
                });
                // terminal_identities.location_id is INTEGER — same
                // string->number coercion as staffAccountId above.
                locationId = locationMap ? Number(locationMap.dgfy_id) : null;
            }
            const terminalResult = mapTerminalRegistryEntryToTerminalIdentity(entry, {
                legacyTenantDbName: target.legacy_tenant_db_name,
                targetBusinessDbName: target.target_business_db_name,
                locationId
            });
            terminalEntries.push({ legacy_tenant_id: target.legacy_tenant_id, ...terminalResult });
        }
        // eslint-disable-next-line no-await-in-loop
        await applyBatchAndRecord({
            metaSequelize, targetSequelize: businessSequelize, runScope,
            legacyTenantId: target.legacy_tenant_id, entityType: 'terminal_identity',
            entries: terminalEntries, dgfyDatabase: target.target_business_db_name, summary, results
        });
    }

    return { run_scope: runScope, summary, results };
}
