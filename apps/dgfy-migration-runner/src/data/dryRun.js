/**
 * Phase 03 Plan 03 (MIG-02, T-03-03-02): read-only dry-run report planner.
 *
 * Consumes the validated migration target manifest, legacy source snapshots
 * (`src/data/legacySource.js`), and the durable `legacy_id_map` (the
 * "current target state probe" — a retried dry-run must classify an
 * already-migrated record as `update`, not a second `insert`) and calls the
 * exact same pure mapper functions apply (03-04) will call
 * (`src/data/mappings.js`) — Pitfall 2 (dry-run/apply drift) never applies
 * here because dry-run has no separate transform logic of its own.
 *
 * Hard contract (verified by this module's own tests, per the plan's threat
 * model):
 * - Never opens a `dgfy_*` target or business database connection, and never
 *   calls a target `bulkInsert`/`bulkUpdate`/`bulkDelete` helper — dry-run
 *   never mutates `dgfy_*` data.
 * - Never advances or writes per-(tenant, entity type) checkpoint state —
 *   that is an apply-mode-only concept (D-03); dry-run only reads existing
 *   `legacy_id_map` state.
 * - Every skip/conflict/orphan finding is persisted via
 *   `recordDataQualityFinding()` (D-04) before the report is returned.
 */

import { createSourceConnection, createLegacyTenantSourceConnection } from '../config/db.js';
import { LEGACY_ID_MAP_TABLE } from '../metadata/bootstrap.js';
import { recordDataQualityFinding } from '../metadata/dataState.js';
import { readLegacyLandlordSnapshot, readLegacyTenantSnapshot, readLegacyProductSnapshot } from './legacySource.js';
import {
    mapLegacyAccountToDgfyAccount,
    mapLegacyTenantToBusiness,
    mapLegacyMembershipToBusinessMembership,
    mapLegacyUserToStaffAccount,
    mapLegacyAccountStaffAssignment,
    mapLegacyLocationToLocation,
    mapTerminalRegistryEntryToTerminalIdentity,
    mapItemFolderToProductFolder,
    mapItemToProduct,
    mapStockMovementToInventoryMovement,
    mapItemLocationStocksToOpeningBalance,
    mapItemEmbeddingToProductEmbedding,
    classifyMappingConflict,
    MAPPING_REASON_CODES
} from './mappings.js';

// A stable run scope shared by dry-run and apply (03-04) so a retried apply
// (or a dry-run rehearsal run before/after an apply) reads the same durable
// legacy_id_map/data_quality_findings rows instead of starting a fresh scope
// every invocation. Exported so 03-04 can reuse the exact same constant.
export const DEFAULT_RUN_SCOPE = 'data-migration';

// `legacy_id_map_key` objects (from mappings.js's mapper results, and from
// legacy_id_map rows themselves) always use the snake_case shape
// { legacy_source, legacy_table, legacy_id } — this key builder matches that
// shape directly rather than requiring a camelCase translation at every call
// site.
function idMapLookupKey({ legacy_source: legacySource, legacy_table: legacyTable, legacy_id: legacyId }) {
    return `${legacySource}|${legacyTable}|${legacyId === undefined || legacyId === null ? '' : String(legacyId)}`;
}

/**
 * Reclassifies a mapper's `operation: 'insert'` result to `'update'` when
 * the record's `legacy_id_map_key` already has a durable mapping row for
 * this run scope — the "current target state probe" the plan's threat model
 * requires (mitigation for "Duplicate writes on retry"). Never touches
 * `skip`/`conflict` results.
 */
function reclassifyOperation(mapperResult, resolvedIdMap) {
    if (mapperResult.operation !== 'insert' || !mapperResult.legacy_id_map_key) {
        return mapperResult;
    }
    const key = idMapLookupKey(mapperResult.legacy_id_map_key);
    if (resolvedIdMap.has(key)) {
        return { ...mapperResult, operation: 'update' };
    }
    return mapperResult;
}

const CREDENTIAL_PAYLOAD_TABLES = new Set(['accounts', 'staff_credentials']);

function hasNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

/**
 * Builds a report-safe copy of a dry-run plan entry. Mapper/apply internals
 * still carry full payloads; only report assembly swaps credential-bearing
 * fields for boolean evidence flags.
 */
export function redactTargetPayload(entry = {}) {
    if (!entry || !entry.target_payload) {
        return { ...entry };
    }

    const targetPayload = entry.target_payload;
    const redactedPayload = {};
    Object.entries(targetPayload).forEach(([key, value]) => {
        if (key !== 'password_hash' && key !== 'pos_approval_pin_hash') {
            redactedPayload[key] = value;
        }
    });

    const credentialBearingTable = CREDENTIAL_PAYLOAD_TABLES.has(entry.target_table);
    if (credentialBearingTable || Object.hasOwn(targetPayload, 'password_hash')) {
        redactedPayload.has_password_hash = hasNonEmptyString(targetPayload.password_hash);
    }
    if (entry.target_table === 'staff_credentials' || Object.hasOwn(targetPayload, 'pos_approval_pin_hash')) {
        redactedPayload.has_pos_approval_pin_hash = hasNonEmptyString(targetPayload.pos_approval_pin_hash);
    }

    return {
        ...entry,
        target_payload: redactedPayload
    };
}

/**
 * Pure: builds the full per-target migration plan (a flat list of plan
 * entries — one per mapper call, including related/derived writes) from
 * already-read legacy snapshots and an already-resolved `legacy_id_map`
 * lookup table. No I/O — every DB read happens before this is called
 * (`runDryRunTransformations()`), so this function is unit-testable without
 * a database.
 *
 * @param {{
 *   targets: Array<{ legacy_tenant_id, legacy_tenant_db_name, target_business_db_name, expected_business_id, expected_owner_account_id }>,
 *   landlordSnapshot: { tenants: object[], accounts: object[], memberships: object[] },
 *   tenantSnapshots: Map<string, { users: object[], locations: object[], userLocationGrants: object[], terminalRegistry: object[], productSnapshot?: object }>,
 *   resolvedIdMap?: Map<string, string>
 * }} input
 * @returns {Array<object>} plan entries: `{ legacy_tenant_id, operation, entity_type, target_table, target_database, target_payload, legacy_id_map_key, related_targets, findings }`
 */
export function buildDryRunPlan({
    targets = [],
    landlordSnapshot = {},
    tenantSnapshots = new Map(),
    resolvedIdMap = new Map()
} = {}) {
    const { tenants = [], accounts = [], memberships = [] } = landlordSnapshot;
    const tenantsById = new Map(tenants.map((tenant) => [String(tenant.id), tenant]));

    const entries = [];

    // 1. Account identity — every landlord account referenced by this run's
    // tenants/memberships, emitted exactly once regardless of how many
    // tenants/memberships reference it.
    const seenAccountIds = new Set();
    accounts.forEach((account) => {
        const accountKey = String(account.id);
        if (seenAccountIds.has(accountKey)) {
            return;
        }
        seenAccountIds.add(accountKey);
        const result = mapLegacyAccountToDgfyAccount(account);
        entries.push({ legacy_tenant_id: null, ...reclassifyOperation(result, resolvedIdMap) });
    });

    targets.forEach((target) => {
        const legacyTenant = tenantsById.get(String(target.legacy_tenant_id));
        const targetContext = {
            targetBusinessDbName: target.target_business_db_name,
            expectedBusinessId: target.expected_business_id,
            expectedOwnerAccountId: target.expected_owner_account_id
        };

        // 2 & 8. Tenant/business (+ business_database_registry and, when
        // owner evidence is confirmed, tenant_ownership_metadata related
        // writes).
        if (legacyTenant) {
            const businessResult = mapLegacyTenantToBusiness(legacyTenant, targetContext);
            entries.push({ legacy_tenant_id: target.legacy_tenant_id, ...reclassifyOperation(businessResult, resolvedIdMap) });

            (businessResult.related_targets || []).forEach((relatedTarget) => {
                entries.push({
                    legacy_tenant_id: target.legacy_tenant_id,
                    operation: relatedTarget.operation,
                    entity_type: relatedTarget.entity_type,
                    target_table: relatedTarget.target_table,
                    target_database: relatedTarget.target_database,
                    target_payload: relatedTarget.target_payload,
                    legacy_id_map_key: businessResult.legacy_id_map_key,
                    related_targets: [],
                    findings: []
                });
            });
        } else {
            entries.push({
                legacy_tenant_id: target.legacy_tenant_id,
                operation: 'conflict',
                entity_type: 'business',
                target_table: 'businesses',
                target_database: null,
                target_payload: null,
                legacy_id_map_key: null,
                related_targets: [],
                findings: [classifyMappingConflict(MAPPING_REASON_CODES.MISSING_REQUIRED_FIELD, {
                    entityType: 'business',
                    legacyTable: 'tenants',
                    legacyId: target.legacy_tenant_id,
                    severity: 'conflict',
                    message: `Migration target manifest references legacy_tenant_id "${target.legacy_tenant_id}" which was not found in the legacy landlord tenants table.`,
                    remediation: 'Verify legacy_tenant_id in the migration target manifest matches an existing legacy tenant, or remove this entry from the manifest.'
                })]
            });
        }

        const tenantMemberships = memberships.filter(
            (membership) => String(membership.tenant_id) === String(target.legacy_tenant_id)
        );

        const tenantSnapshot = tenantSnapshots.get(target.legacy_tenant_id) || {};
        const { users = [], locations = [], terminalRegistry = [], productSnapshot = {} } = tenantSnapshot;
        const {
            itemFolders = [],
            items = [],
            stockMovements = [],
            itemEmbeddings = []
        } = productSnapshot;

        // 4. Staff accounts — must run before assignments (5) so a staff
        // account's resolved dgfy_id (if this run scope already migrated it
        // via a prior apply) can be supplied to the assignment mapper.
        const seenStaffEmails = new Set();
        const staffAccountIdByLegacyUserId = new Map();

        users.forEach((user) => {
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

            const reclassified = reclassifyOperation(staffResult, resolvedIdMap);
            entries.push({ legacy_tenant_id: target.legacy_tenant_id, ...reclassified });

            if (staffResult.legacy_id_map_key) {
                const resolvedStaffAccountId = resolvedIdMap.get(idMapLookupKey(staffResult.legacy_id_map_key));
                if (resolvedStaffAccountId) {
                    staffAccountIdByLegacyUserId.set(String(user.user_id), resolvedStaffAccountId);
                }
            }
        });

        // 3 & 5. Business membership + account-staff assignment (same
        // legacy dgfy_account_tenant_memberships row, two target tables).
        tenantMemberships.forEach((membership) => {
            const membershipResult = mapLegacyMembershipToBusinessMembership(membership, targetContext);
            entries.push({ legacy_tenant_id: target.legacy_tenant_id, ...reclassifyOperation(membershipResult, resolvedIdMap) });

            const resolvedStaffAccountId = membership.tenant_user_id
                ? staffAccountIdByLegacyUserId.get(String(membership.tenant_user_id)) || null
                : null;

            const assignmentResult = mapLegacyAccountStaffAssignment(membership, {
                staffAccountId: resolvedStaffAccountId,
                targetBusinessDbName: target.target_business_db_name
            });
            entries.push({ legacy_tenant_id: target.legacy_tenant_id, ...reclassifyOperation(assignmentResult, resolvedIdMap) });
        });

        // 6. Locations — must run before terminals (7) for the same reason
        // staff must run before assignments.
        const locationIdByLegacyLocationId = new Map();
        locations.forEach((location) => {
            const locationResult = mapLegacyLocationToLocation(location, {
                legacyTenantDbName: target.legacy_tenant_db_name,
                targetBusinessDbName: target.target_business_db_name
            });
            const reclassified = reclassifyOperation(locationResult, resolvedIdMap);
            entries.push({ legacy_tenant_id: target.legacy_tenant_id, ...reclassified });

            if (locationResult.legacy_id_map_key) {
                const resolvedLocationId = resolvedIdMap.get(idMapLookupKey(locationResult.legacy_id_map_key));
                if (resolvedLocationId) {
                    locationIdByLegacyLocationId.set(String(location.location_id), resolvedLocationId);
                }
            }
        });

        // 7. Terminal identities.
        terminalRegistry.forEach((entry) => {
            const resolvedLocationId = entry.location_id
                ? locationIdByLegacyLocationId.get(String(entry.location_id)) || null
                : null;

            const terminalResult = mapTerminalRegistryEntryToTerminalIdentity(entry, {
                legacyTenantDbName: target.legacy_tenant_db_name,
                targetBusinessDbName: target.target_business_db_name,
                locationId: resolvedLocationId
            });
            entries.push({ legacy_tenant_id: target.legacy_tenant_id, ...reclassifyOperation(terminalResult, resolvedIdMap) });
        });

        // 8. Product folders — must precede products so retried dry-runs can
        // resolve products.folder_id through the durable legacy_id_map.
        itemFolders.forEach((folder) => {
            const folderResult = mapItemFolderToProductFolder(folder, {
                legacyTenantDbName: target.legacy_tenant_db_name,
                targetBusinessDbName: target.target_business_db_name,
                expectedBusinessId: target.expected_business_id
            });
            entries.push({ legacy_tenant_id: target.legacy_tenant_id, ...reclassifyOperation(folderResult, resolvedIdMap) });
        });

        // 9. Products — folder_id is pre-resolved from legacy_id_map when
        // available, matching the location-to-terminal dry-run pattern above.
        items.forEach((item) => {
            let resolvedFolderId = null;
            if (item.folder_id) {
                const folderKey = {
                    legacy_source: target.legacy_tenant_db_name,
                    legacy_table: 'item_folders',
                    legacy_id: item.folder_id
                };
                resolvedFolderId = resolvedIdMap.get(idMapLookupKey(folderKey)) || null;
            }

            const productResult = mapItemToProduct(item, {
                legacyTenantDbName: target.legacy_tenant_db_name,
                targetBusinessDbName: target.target_business_db_name,
                expectedBusinessId: target.expected_business_id,
                resolvedFolderId,
                itemLocationStocks: item.itemLocationStocks || []
            });
            entries.push({ legacy_tenant_id: target.legacy_tenant_id, ...reclassifyOperation(productResult, resolvedIdMap) });
        });

        // 10. Stock movements — products are planned first so product_id can
        // be resolved from a prior apply's durable map when this is a retry.
        stockMovements.forEach((movement) => {
            const productKey = {
                legacy_source: target.legacy_tenant_db_name,
                legacy_table: 'items',
                legacy_id: movement.item_id
            };
            const resolvedProductId = resolvedIdMap.get(idMapLookupKey(productKey)) || null;
            const movementResult = mapStockMovementToInventoryMovement(movement, {
                legacyTenantDbName: target.legacy_tenant_db_name,
                targetBusinessDbName: target.target_business_db_name,
                expectedBusinessId: target.expected_business_id,
                resolvedProductId
            });
            entries.push({ legacy_tenant_id: target.legacy_tenant_id, ...reclassifyOperation(movementResult, resolvedIdMap) });
        });

        // 11. Opening-balance inventory movements from item_location_stocks
        // (or current_stock fallback), after product planning for product_id.
        items.forEach((item) => {
            const productKey = {
                legacy_source: target.legacy_tenant_db_name,
                legacy_table: 'items',
                legacy_id: item.item_id
            };
            const resolvedProductId = resolvedIdMap.get(idMapLookupKey(productKey)) || null;
            const openingBalanceResult = mapItemLocationStocksToOpeningBalance(item, {
                legacyTenantDbName: target.legacy_tenant_db_name,
                targetBusinessDbName: target.target_business_db_name,
                expectedBusinessId: target.expected_business_id,
                resolvedProductId,
                itemLocationStocks: item.itemLocationStocks || []
            });
            entries.push({ legacy_tenant_id: target.legacy_tenant_id, ...reclassifyOperation(openingBalanceResult, resolvedIdMap) });
        });

        // 12. Product embeddings — after products, resolving product_id from
        // the durable items -> products map on retried dry-runs.
        itemEmbeddings.forEach((embedding) => {
            const productKey = {
                legacy_source: target.legacy_tenant_db_name,
                legacy_table: 'items',
                legacy_id: embedding.item_id
            };
            const resolvedProductId = resolvedIdMap.get(idMapLookupKey(productKey)) || null;
            const embeddingResult = mapItemEmbeddingToProductEmbedding(embedding, {
                legacyTenantDbName: target.legacy_tenant_db_name,
                targetBusinessDbName: target.target_business_db_name,
                expectedBusinessId: target.expected_business_id,
                resolvedProductId
            });
            entries.push({ legacy_tenant_id: target.legacy_tenant_id, ...reclassifyOperation(embeddingResult, resolvedIdMap) });
        });
    });

    return entries;
}

/**
 * Pure: computes the scalar dry-run summary counters plus the per-tenant
 * coverage list from a flat list of plan entries. `summary` is deliberately
 * scalar-only (D-16/summaryWriter.js convention — `buildSummaryLine()` skips
 * non-scalar object/array fields); the richer `tenant_coverage` array is a
 * separate top-level report field, not nested under `summary`.
 *
 * @param {Array<object>} entries plan entries from buildDryRunPlan()
 * @param {Array<{ legacy_tenant_id, legacy_tenant_db_name, target_business_db_name }>} targets
 */
export function summarizeDryRunReport(entries = [], targets = []) {
    const summary = {
        planned_inserts: 0,
        planned_updates: 0,
        planned_skips: 0,
        planned_conflicts: 0,
        orphan_records: 0,
        tenant_coverage_count: targets.length
    };

    const tenantCoverageByTenantId = new Map(targets.map((target) => [
        target.legacy_tenant_id,
        {
            legacy_tenant_id: target.legacy_tenant_id,
            legacy_tenant_db_name: target.legacy_tenant_db_name,
            target_business_db_name: target.target_business_db_name,
            entities_planned: 0
        }
    ]));

    entries.forEach((entry) => {
        switch (entry.operation) {
            case 'insert':
                summary.planned_inserts += 1;
                break;
            case 'update':
                summary.planned_updates += 1;
                break;
            case 'skip':
                summary.planned_skips += 1;
                break;
            case 'conflict':
                summary.planned_conflicts += 1;
                break;
            default:
                break;
        }

        (entry.findings || []).forEach((finding) => {
            if (finding.severity === 'orphan') {
                summary.orphan_records += 1;
            }
        });

        if (entry.legacy_tenant_id && tenantCoverageByTenantId.has(entry.legacy_tenant_id)) {
            tenantCoverageByTenantId.get(entry.legacy_tenant_id).entities_planned += 1;
        }
    });

    return { summary, tenant_coverage: Array.from(tenantCoverageByTenantId.values()) };
}

/**
 * Fetches every existing `legacy_id_map` row for this run scope in a single
 * query — the "current target state probe" `buildDryRunPlan()` uses to
 * reclassify `insert` -> `update`. Never touches any other metadata table
 * and never mutates `legacy_id_map` itself (read-only `SELECT`).
 */
async function fetchResolvedIdMap(metaSequelize, runScope) {
    const [rows] = await metaSequelize.query(
        `SELECT legacy_source, legacy_table, legacy_id, dgfy_id FROM ${LEGACY_ID_MAP_TABLE} WHERE run_scope = ?`,
        { replacements: [runScope] }
    );

    const resolvedIdMap = new Map();
    (rows || []).forEach((row) => {
        resolvedIdMap.set(
            idMapLookupKey(row),
            row.dgfy_id
        );
    });
    return resolvedIdMap;
}

/**
 * Orchestrates a full dry-run: opens read-only legacy source connections
 * (landlord + one per manifest-listed legacy tenant DB), reads snapshots,
 * resolves existing `legacy_id_map` state, builds the plan, persists every
 * finding, and returns the summary/coverage/results the caller
 * (`src/commands/data.js`) writes into the JSON + summary reports.
 *
 * Opens no `dgfy_*` target/business connection and writes no checkpoint
 * state — dry-run performs no target mutation and marks no checkpoints
 * (checkpoints are an apply-only concept, D-03).
 *
 * @param {{ config: object, metaSequelize: import('sequelize').Sequelize, targets: object[], runScope?: string }} params
 */
export async function runDryRunTransformations({ config, metaSequelize, targets, runScope = DEFAULT_RUN_SCOPE }) {
    const landlordSequelize = createSourceConnection(config);
    const landlordSnapshot = await readLegacyLandlordSnapshot(landlordSequelize, targets);

    const tenantSnapshots = new Map();
    for (const target of targets) {
        // eslint-disable-next-line no-await-in-loop
        const tenantSequelize = createLegacyTenantSourceConnection(config, target.legacy_tenant_db_name);
        // eslint-disable-next-line no-await-in-loop
        const tenantSnapshot = await readLegacyTenantSnapshot(tenantSequelize);
        // eslint-disable-next-line no-await-in-loop
        const productSnapshot = await readLegacyProductSnapshot(tenantSequelize);
        tenantSnapshots.set(target.legacy_tenant_id, { ...tenantSnapshot, productSnapshot });
    }

    const resolvedIdMap = await fetchResolvedIdMap(metaSequelize, runScope);

    const entries = buildDryRunPlan({ targets, landlordSnapshot, tenantSnapshots, resolvedIdMap });

    // D-04: persist every skip/conflict/orphan finding before returning —
    // never silently dropped from the migration report.
    for (const entry of entries) {
        for (const finding of entry.findings || []) {
            // eslint-disable-next-line no-await-in-loop
            await recordDataQualityFinding(metaSequelize, {
                runScope,
                legacyTenantId: entry.legacy_tenant_id,
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

    const { summary, tenant_coverage } = summarizeDryRunReport(entries, targets);

    return { run_scope: runScope, entries, summary, tenant_coverage };
}
