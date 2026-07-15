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
import { recordDataQualityFinding, syncDataQualityFindings } from '../metadata/dataState.js';
import {
    readLegacyLandlordSnapshot,
    readLegacyTenantSnapshot,
    readLegacyProductSnapshot,
    readLegacySalesSnapshot
} from './legacySource.js';
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
    mapPosTransactionToAvailment,
    mapPosTransactionLineToAvailmentItem,
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

// Phase 14 (SHM-01/02, T-14-04-03): sentinel prefix marking a dependency
// (an availment header or a product) that is validly planned as an
// insert/update *within this same dry-run pass* but has no durable
// legacy_id_map row yet (a clean-target first run never does — dry-run
// performs no target write, so it can never observe a real just-inserted
// id the way apply.js can). Distinguishes "this line's parent/product will
// exist once apply runs" from "this line's parent/product genuinely does
// not exist anywhere in this run's plan" — only the latter is a real
// blocking orphan. Never a valid dgfy_id shape, so it can never be
// confused with a real resolved target id in a report.
const PENDING_DEPENDENCY_PREFIX = 'pending:';

/**
 * Resolves a dependency's target id for dry-run line-item planning: a
 * durable `legacy_id_map` row (already migrated by a prior apply) always
 * wins; otherwise, if the dependency was validly planned as an insert/
 * update earlier in this same pass, a `PENDING_DEPENDENCY_PREFIX`-prefixed
 * sentinel is returned so the line mapper does not falsely orphan it;
 * otherwise `null` (the dependency is genuinely absent from this run's
 * plan — a real blocking orphan).
 */
function resolvePlannedDependencyId(key, resolvedIdMap, plannedKeys) {
    const lookupKey = idMapLookupKey(key);
    const durableId = resolvedIdMap.get(lookupKey);
    if (durableId) {
        return durableId;
    }
    if (plannedKeys.has(lookupKey)) {
        return `${PENDING_DEPENDENCY_PREFIX}${lookupKey}`;
    }
    return null;
}

const CREDENTIAL_PAYLOAD_TABLES = new Set(['accounts', 'staff_credentials']);

function hasNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

/**
 * Recursively collects every key name found at any level of a (nested)
 * plain-object value, deduplicated. Never collects *values* — only key
 * names — so this is safe to surface in a report even when the object
 * carries sensitive legacy data (Phase 14 T-14-04-01: dry-run report
 * snapshots must never disclose legacy values).
 */
function collectObjectKeysDeep(value, keys = new Set()) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.entries(value).forEach(([key, nestedValue]) => {
            keys.add(key);
            collectObjectKeysDeep(nestedValue, keys);
        });
    }
    return keys;
}

/**
 * Builds a report-safe copy of a dry-run plan entry. Mapper/apply internals
 * still carry full payloads; only report assembly swaps credential-bearing
 * fields for boolean evidence flags and replaces any `legacy_snapshot`
 * value (Phase 14 sales-history headers/lines) with presence + key-name
 * evidence only (T-14-04-01) — never the seeded legacy values themselves.
 */
export function redactTargetPayload(entry = {}) {
    if (!entry || !entry.target_payload) {
        return { ...entry };
    }

    const targetPayload = entry.target_payload;
    const redactedPayload = {};
    Object.entries(targetPayload).forEach(([key, value]) => {
        if (key === 'password_hash' || key === 'pos_approval_pin_hash' || key === 'legacy_snapshot') {
            return;
        }
        redactedPayload[key] = value;
    });

    const credentialBearingTable = CREDENTIAL_PAYLOAD_TABLES.has(entry.target_table);
    if (credentialBearingTable || Object.hasOwn(targetPayload, 'password_hash')) {
        redactedPayload.has_password_hash = hasNonEmptyString(targetPayload.password_hash);
    }
    if (entry.target_table === 'staff_credentials' || Object.hasOwn(targetPayload, 'pos_approval_pin_hash')) {
        redactedPayload.has_pos_approval_pin_hash = hasNonEmptyString(targetPayload.pos_approval_pin_hash);
    }

    if (Object.hasOwn(targetPayload, 'legacy_snapshot')) {
        const snapshotValue = targetPayload.legacy_snapshot;
        redactedPayload.has_legacy_snapshot = snapshotValue !== null && snapshotValue !== undefined;
        redactedPayload.legacy_snapshot_keys = Array.from(collectObjectKeysDeep(snapshotValue)).sort();
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
 *   tenantSnapshots: Map<string, { users: object[], locations: object[], userLocationGrants: object[], terminalRegistry: object[], productSnapshot?: object, salesSnapshot?: { posTransactions: object[], posTransactionLines: object[] } }>,
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
        const { users = [], locations = [], terminalRegistry = [], productSnapshot = {}, salesSnapshot = {} } = tenantSnapshot;
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
        const terminalIdentityIdByLegacyTerminalId = new Map();
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

            if (terminalResult.legacy_id_map_key) {
                const resolvedTerminalIdentityId = resolvedIdMap.get(idMapLookupKey(terminalResult.legacy_id_map_key));
                if (resolvedTerminalIdentityId) {
                    terminalIdentityIdByLegacyTerminalId.set(String(entry.terminal_id), resolvedTerminalIdentityId);
                }
            }
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
        // Phase 14 (T-14-04-03): also tracks which legacy items are validly
        // planned as insert/update in this same pass, so sales-line planning
        // (14) can distinguish "this line's product will exist once apply
        // runs" from a genuinely absent product.
        const plannedProductKeys = new Set();
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
            const reclassifiedProduct = reclassifyOperation(productResult, resolvedIdMap);
            entries.push({ legacy_tenant_id: target.legacy_tenant_id, ...reclassifiedProduct });

            if (
                (reclassifiedProduct.operation === 'insert' || reclassifiedProduct.operation === 'update')
                && productResult.legacy_id_map_key
            ) {
                plannedProductKeys.add(idMapLookupKey(productResult.legacy_id_map_key));
            }
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

        // 13. Availments (sales headers) — after every Phase 13 product-
        // domain entity (8-12), resolving location/terminal/cashier
        // attribution via the same durable legacy_id_map lookups built for
        // entities 4/6/7 above. Tracks which legacy pos_transactions rows
        // are validly planned as insert/update this pass (T-14-04-03), so
        // line planning (14) can tell "parent will exist once apply runs"
        // apart from a genuinely absent parent.
        const { posTransactions = [], posTransactionLines = [] } = salesSnapshot;
        const plannedAvailmentKeys = new Set();

        posTransactions.forEach((transaction) => {
            const resolvedLocationId = transaction.location_id
                ? locationIdByLegacyLocationId.get(String(transaction.location_id)) || null
                : null;
            const resolvedTerminalId = transaction.terminal_id
                ? terminalIdentityIdByLegacyTerminalId.get(String(transaction.terminal_id)) || null
                : null;
            const resolvedCashierId = transaction.cashier_id
                ? staffAccountIdByLegacyUserId.get(String(transaction.cashier_id)) || null
                : null;

            const availmentResult = mapPosTransactionToAvailment(transaction, {
                legacyTenantDbName: target.legacy_tenant_db_name,
                targetBusinessDbName: target.target_business_db_name,
                expectedBusinessId: target.expected_business_id,
                resolvedLocationId,
                resolvedTerminalId,
                resolvedCashierId
            });
            const reclassifiedAvailment = reclassifyOperation(availmentResult, resolvedIdMap);
            entries.push({ legacy_tenant_id: target.legacy_tenant_id, ...reclassifiedAvailment });

            if (
                (reclassifiedAvailment.operation === 'insert' || reclassifiedAvailment.operation === 'update')
                && availmentResult.legacy_id_map_key
            ) {
                plannedAvailmentKeys.add(idMapLookupKey(availmentResult.legacy_id_map_key));
            }
        });

        // 14. Availment items (sales lines) — both target FKs (availment_id,
        // product_id) are non-null, so a genuinely unresolved dependency is
        // a real blocking skip; a dependency that is durably resolved OR
        // validly planned this same pass (13, or Phase 13's product loop
        // above) is not (T-14-04-03).
        const itemNameByLegacyItemId = new Map(items.map((item) => [String(item.item_id), item.name ?? null]));

        posTransactionLines.forEach((line) => {
            const resolvedAvailmentId = resolvePlannedDependencyId(
                { legacy_source: target.legacy_tenant_db_name, legacy_table: 'pos_transactions', legacy_id: line.pos_transaction_id },
                resolvedIdMap,
                plannedAvailmentKeys
            );
            const resolvedProductId = resolvePlannedDependencyId(
                { legacy_source: target.legacy_tenant_db_name, legacy_table: 'items', legacy_id: line.item_id },
                resolvedIdMap,
                plannedProductKeys
            );
            const resolvedProductName = itemNameByLegacyItemId.get(String(line.item_id)) || null;

            const lineResult = mapPosTransactionLineToAvailmentItem(line, {
                legacyTenantDbName: target.legacy_tenant_db_name,
                targetBusinessDbName: target.target_business_db_name,
                expectedBusinessId: target.expected_business_id,
                resolvedAvailmentId,
                resolvedProductId,
                resolvedProductName
            });
            entries.push({ legacy_tenant_id: target.legacy_tenant_id, ...reclassifyOperation(lineResult, resolvedIdMap) });
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
// Phase 14 (Plan 03/VER-01): the two new sales entity types adopt the
// reason-lifecycle-aware sync helper (open/reopen/leave/resolve per exact
// reason_code) instead of the older Phase 3 append-only
// recordDataQualityFinding() loop, so a rerun over a live, continuously-
// growing source table (D-14-06) never accumulates duplicate rows for a
// still-open reason and always resolves a reason no longer emitted. Every
// other (Phase 3/13) entity type keeps its existing append-only behavior
// unchanged.
const SYNC_LIFECYCLE_ENTITY_TYPES = new Set(['availment', 'availment_item']);

function toSyncFindings(findings = []) {
    return findings.map((finding) => ({
        severity: finding.severity,
        reasonCode: finding.reason_code,
        message: finding.message,
        remediation: finding.remediation ?? null
    }));
}

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
 * Closes a Sequelize connection this orchestration opened, if it was ever
 * successfully constructed. Tolerant of connections that don't expose a
 * `close()` method (older/lighter test doubles) so it never itself throws
 * during cleanup and is always safe to call unconditionally from `finally`
 * (T-14-04-02: creator-owned pool closure, on success and on failure).
 */
async function closeConnectionSafely(sequelize) {
    if (sequelize && typeof sequelize.close === 'function') {
        await sequelize.close();
    }
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
 * (checkpoints are an apply-only concept, D-03). Every connection this
 * function creates (landlord + each legacy tenant) is closed in `finally`
 * on both success and any thrown error (T-14-04-02).
 *
 * @param {{ config: object, metaSequelize: import('sequelize').Sequelize, targets: object[], runScope?: string }} params
 */
export async function runDryRunTransformations({ config, metaSequelize, targets, runScope = DEFAULT_RUN_SCOPE }) {
    let landlordSequelize = null;
    const tenantSequelizes = [];

    try {
        landlordSequelize = createSourceConnection(config);
        const landlordSnapshot = await readLegacyLandlordSnapshot(landlordSequelize, targets);

        const tenantSnapshots = new Map();
        for (const target of targets) {
            // eslint-disable-next-line no-await-in-loop
            const tenantSequelize = createLegacyTenantSourceConnection(config, target.legacy_tenant_db_name);
            tenantSequelizes.push(tenantSequelize);
            // eslint-disable-next-line no-await-in-loop
            const tenantSnapshot = await readLegacyTenantSnapshot(tenantSequelize);
            // eslint-disable-next-line no-await-in-loop
            const productSnapshot = await readLegacyProductSnapshot(tenantSequelize);
            // eslint-disable-next-line no-await-in-loop
            const salesSnapshot = await readLegacySalesSnapshot(tenantSequelize);
            tenantSnapshots.set(target.legacy_tenant_id, { ...tenantSnapshot, productSnapshot, salesSnapshot });
        }

        const resolvedIdMap = await fetchResolvedIdMap(metaSequelize, runScope);

        const entries = buildDryRunPlan({ targets, landlordSnapshot, tenantSnapshots, resolvedIdMap });

        // D-04: persist every skip/conflict/orphan finding before returning —
        // never silently dropped from the migration report. Phase 14 sales
        // entities (availment/availment_item) sync the record's full current
        // reason set (open/reopen/leave/resolve); every other entity type
        // keeps the original Phase 3 append-only insert.
        for (const entry of entries) {
            if (SYNC_LIFECYCLE_ENTITY_TYPES.has(entry.entity_type)) {
                const legacyTable = entry.legacy_id_map_key?.legacy_table
                    ?? entry.findings?.[0]?.legacy_table
                    ?? null;
                const legacyId = entry.legacy_id_map_key?.legacy_id
                    ?? entry.findings?.[0]?.legacy_id
                    ?? null;

                // eslint-disable-next-line no-await-in-loop
                await syncDataQualityFindings(metaSequelize, {
                    runScope,
                    legacyTenantId: entry.legacy_tenant_id,
                    entityType: entry.entity_type,
                    legacyTable,
                    legacyId,
                    findings: toSyncFindings(entry.findings)
                });
                continue; // eslint-disable-line no-continue
            }

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
    } finally {
        // eslint-disable-next-line no-await-in-loop
        await closeConnectionSafely(landlordSequelize);
        for (const tenantSequelize of tenantSequelizes) {
            // eslint-disable-next-line no-await-in-loop
            await closeConnectionSafely(tenantSequelize);
        }
    }
}
