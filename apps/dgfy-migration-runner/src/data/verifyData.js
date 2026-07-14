/**
 * Phase 03 Plan 05 (MIG-05, T-03-05-02): data verification reconciliation.
 *
 * Compares source (legacy) counts/state against target (`dgfy_core`/
 * `dgfy_business_*`) counts/state for every manifest target, using the same
 * `legacy_id_map`/`data_quality_findings` durable metadata dry-run (03-03)
 * and apply (03-04) both wrote to. Every pure comparison function here is
 * unit-testable without a database; `buildDataVerificationSections()` is the
 * only orchestration entry point that opens connections/issues queries.
 *
 * Hard contract (per the plan's threat model and must_haves):
 * - Missing accepted membership conflicts (and any other open
 *   skip/conflict/orphan finding) are reported as unresolved, never treated
 *   as clean — `data_migration_ok` is false while any finding is open.
 * - Optional storefront discovery projection evidence is informational only
 *   and never controls `data_migration_ok`.
 */

import { LEGACY_ID_MAP_TABLE } from '../metadata/bootstrap.js';
import { listOpenDataQualityFindings } from '../metadata/dataState.js';
import {
    createSourceConnection,
    createLegacyTenantSourceConnection,
    createBusinessTargetConnection
} from '../config/db.js';
import { readLegacyLandlordSnapshot, readLegacyTenantSnapshot } from './legacySource.js';
import { MAPPING_REASON_CODES } from './mappings.js';
import { DEFAULT_RUN_SCOPE } from './dryRun.js';

export { DEFAULT_RUN_SCOPE };

export const EXPECTED_LOSSY_REASON_CODES = Object.freeze(new Set([
    MAPPING_REASON_CODES.LOSSY_CATEGORY_COLLAPSE,
    MAPPING_REASON_CODES.FOLDER_NESTING_FLATTENED
]));

/**
 * Pure: compares expected-vs-actual row counts per entity for a single
 * target. Each entry already carries the mapper-aware `expected_target_count`
 * (source count minus records this run legitimately skipped/conflicted) —
 * comparing raw source counts directly against target counts would produce
 * false mismatches for every intentional skip/conflict (D-04).
 *
 * @param {Array<{entity: string, source_count: number, expected_target_count: number, target_count: number}>} entries
 */
export function checkDataCounts(entries = []) {
    const mismatches = entries
        .filter((entry) => entry.target_count !== entry.expected_target_count)
        .map((entry) => ({
            entity: entry.entity,
            source_count: entry.source_count,
            expected_target_count: entry.expected_target_count,
            target_count: entry.target_count
        }));

    return {
        ok: mismatches.length === 0,
        checked_entities: entries.map((entry) => entry.entity),
        mismatches
    };
}

/**
 * Pure: verifies every `account_staff_assignments` row is backed by an
 * accepted `business_memberships` row for the same (account, business) pair
 * (ADR 0028 — never inferred from email/phone, always an explicit accepted
 * membership), and every `terminal_identities.location_id` resolves to a
 * migrated `locations.id` in the same business database.
 *
 * @param {{
 *   businessId: string,
 *   accountStaffAssignments: Array<{id, dgfy_account_id}>,
 *   businessMemberships: Array<{account_id, business_id}>,
 *   terminalIdentities: Array<{id, location_id}>,
 *   locationIds: Array<string|number>
 * }} params
 */
export function checkRequiredRelationships({
    businessId,
    accountStaffAssignments = [],
    businessMemberships = [],
    terminalIdentities = [],
    locationIds = []
} = {}) {
    const violations = [];

    const acceptedMembershipAccountIds = new Set(
        businessMemberships
            .filter((membership) => String(membership.business_id) === String(businessId))
            .map((membership) => String(membership.account_id))
    );

    accountStaffAssignments.forEach((assignment) => {
        if (!acceptedMembershipAccountIds.has(String(assignment.dgfy_account_id))) {
            violations.push({
                entity_type: 'account_staff_assignment',
                target_id: assignment.id,
                reason: 'account_staff_assignments row exists without a corresponding accepted business_memberships row for the same account/business (ADR 0028)'
            });
        }
    });

    const locationIdSet = new Set((locationIds || []).map(String));
    terminalIdentities.forEach((terminal) => {
        if (!terminal.location_id || !locationIdSet.has(String(terminal.location_id))) {
            violations.push({
                entity_type: 'terminal_identity',
                target_id: terminal.id,
                reason: 'terminal_identities row references a location_id that does not resolve to a migrated locations row'
            });
        }
    });

    return { ok: violations.length === 0, violations };
}

/**
 * Pure: checks that every legacy record this run was expected to map
 * (`expectedLegacyKeys`, each shaped `${legacy_source}|${legacy_table}|${legacy_id}`,
 * matching `dryRun.js`'s `idMapLookupKey()` format) has a durable
 * `legacy_id_map` row. Records this run intentionally skipped/conflicted
 * should never be included in `expectedLegacyKeys` by the caller — a
 * completeness gap here means a record that *should* have been mapped
 * (insert/update) was not.
 *
 * @param {{expectedLegacyKeys: string[], mappedLegacyKeys: Set<string>}} params
 */
export function checkMapCompleteness({ expectedLegacyKeys = [], mappedLegacyKeys = new Set() } = {}) {
    const missing = expectedLegacyKeys.filter((key) => !mappedLegacyKeys.has(key));

    return {
        ok: missing.length === 0,
        expected_count: expectedLegacyKeys.length,
        mapped_count: expectedLegacyKeys.length - missing.length,
        missing
    };
}

/**
 * Pure: any non-expected open (unresolved) data-quality finding — skip,
 * conflict, or orphan — fails this check. Expected lossy product-domain
 * findings stay visible for audit but do not block `data_migration_ok`.
 *
 * @param {Array<{severity: string}>} openFindings
 */
export function checkOpenFindings(openFindings = []) {
    const bySeverity = { conflict: 0, skip: 0, orphan: 0 };
    const expectedLossyFindings = [];
    const blockingFindings = [];

    openFindings.forEach((finding) => {
        if (Object.prototype.hasOwnProperty.call(bySeverity, finding.severity)) {
            bySeverity[finding.severity] += 1;
        }
        if (EXPECTED_LOSSY_REASON_CODES.has(finding.reason_code)) {
            expectedLossyFindings.push(finding);
        } else {
            blockingFindings.push(finding);
        }
    });

    return {
        ok: blockingFindings.length === 0,
        open_count: openFindings.length,
        blocking_count: blockingFindings.length,
        expected_lossy_count: expectedLossyFindings.length,
        by_severity: bySeverity,
        blocking_findings: blockingFindings,
        expected_lossy_findings: expectedLossyFindings,
        findings: openFindings
    };
}

/**
 * Pure: informational-only storefront discovery projection evidence.
 * Deliberately always `blocking: false` and never folded into
 * `data_migration_ok` — MIG-01/03-RESEARCH.md Open Question 3 keeps this
 * projection out of the critical migration path.
 *
 * @param {Array<object>} projectionRows
 */
export function summarizeStorefrontDiscoveryProjection(projectionRows = []) {
    return {
        blocking: false,
        row_count: projectionRows.length,
        note: 'Informational only — storefront discovery projection is never part of the critical MIG-01..MIG-05 verification path.'
    };
}

/**
 * Builds the `legacy_source|legacy_table|legacy_id` key set of legacy_id_map
 * rows for this run scope (same format `dryRun.js`'s `idMapLookupKey()`
 * uses).
 */
async function fetchMappedLegacyKeys(metaSequelize, runScope) {
    const [rows] = await metaSequelize.query(
        `SELECT legacy_source, legacy_table, legacy_id FROM ${LEGACY_ID_MAP_TABLE} WHERE run_scope = ?`,
        { replacements: [runScope] }
    );

    const mappedLegacyKeys = new Set();
    (rows || []).forEach((row) => {
        mappedLegacyKeys.add(`${row.legacy_source}|${row.legacy_table}|${row.legacy_id}`);
    });
    return mappedLegacyKeys;
}

async function selectAll(connection, tableName) {
    const [rows] = await connection.query(`SELECT * FROM ${tableName}`);
    return rows || [];
}

/**
 * Builds one target's full data verification entry: source/target entity
 * counts (net of this run's own skip/conflict findings), `legacy_id_map`
 * completeness, and required-relationship checks (account_staff_assignments
 * <-> business_memberships, terminal_identities <-> locations). Never
 * throws — a connection/query failure is captured as `ok:false` with an
 * `error` field, matching verify.js's own never-throws contract.
 */
async function buildTargetDataVerification({
    config,
    target,
    tenantMemberships,
    businessMemberships,
    mappedLegacyKeys,
    openFindings
}) {
    const legacyTenantId = target.legacy_tenant_id;

    try {
        const tenantSequelize = createLegacyTenantSourceConnection(config, target.legacy_tenant_db_name);
        const tenantSnapshot = await readLegacyTenantSnapshot(tenantSequelize);

        const businessSequelize = createBusinessTargetConnection(config, target.target_business_db_name);
        const [staffAccounts, accountStaffAssignments, locations, terminalIdentities] = await Promise.all([
            selectAll(businessSequelize, 'staff_accounts'),
            selectAll(businessSequelize, 'account_staff_assignments'),
            selectAll(businessSequelize, 'locations'),
            selectAll(businessSequelize, 'terminal_identities')
        ]);

        const skippedByEntity = { staff_account: 0, business_membership: 0, account_staff_assignment: 0, location: 0, terminal_identity: 0 };
        openFindings
            .filter((finding) => String(finding.legacy_tenant_id) === String(legacyTenantId))
            .forEach((finding) => {
                if (Object.prototype.hasOwnProperty.call(skippedByEntity, finding.entity_type)) {
                    skippedByEntity[finding.entity_type] += 1;
                }
            });

        const dataCounts = checkDataCounts([
            {
                entity: 'staff_accounts',
                source_count: tenantSnapshot.users.length,
                expected_target_count: tenantSnapshot.users.length - skippedByEntity.staff_account,
                target_count: staffAccounts.length
            },
            {
                entity: 'account_staff_assignments',
                source_count: tenantMemberships.length,
                expected_target_count: tenantMemberships.length - skippedByEntity.account_staff_assignment,
                target_count: accountStaffAssignments.length
            },
            {
                entity: 'locations',
                source_count: tenantSnapshot.locations.length,
                expected_target_count: tenantSnapshot.locations.length - skippedByEntity.location,
                target_count: locations.length
            },
            {
                entity: 'terminal_identities',
                source_count: tenantSnapshot.terminalRegistry.length,
                expected_target_count: tenantSnapshot.terminalRegistry.length - skippedByEntity.terminal_identity,
                target_count: terminalIdentities.length
            }
        ]);

        const legacyTenantSource = target.legacy_tenant_db_name;
        const expectedLegacyKeys = [
            ...tenantSnapshot.users.map((user) => `${legacyTenantSource}|users|${user.user_id}`),
            ...tenantSnapshot.locations.map((location) => `${legacyTenantSource}|tenant_locations|${location.location_id}`)
        ];
        const mapCompleteness = checkMapCompleteness({ expectedLegacyKeys, mappedLegacyKeys });

        const relationships = checkRequiredRelationships({
            businessId: target.expected_business_id,
            accountStaffAssignments,
            businessMemberships,
            terminalIdentities,
            locationIds: locations.map((location) => location.id)
        });

        return {
            legacy_tenant_id: legacyTenantId,
            target_business_db_name: target.target_business_db_name,
            ok: dataCounts.ok && mapCompleteness.ok && relationships.ok,
            data_counts: dataCounts,
            map_completeness: mapCompleteness,
            required_relationships: relationships
        };
    } catch (error) {
        return {
            legacy_tenant_id: legacyTenantId,
            target_business_db_name: target.target_business_db_name,
            ok: false,
            error: error.message
        };
    }
}

/**
 * Orchestrates the full MIG-05 data verification reconciliation: per-target
 * source/target counts, `legacy_id_map` completeness, required
 * (account_staff_assignments <-> business_memberships, terminal_identities
 * <-> locations) relationships, unresolved data-quality findings, and
 * optional (non-blocking) storefront discovery projection evidence.
 *
 * @param {{
 *   config: object,
 *   targetSequelize: import('sequelize').Sequelize,
 *   metaSequelize: import('sequelize').Sequelize,
 *   targets: object[],
 *   runScope?: string
 * }} params
 */
export async function buildDataVerificationSections({ config, targetSequelize, metaSequelize, targets = [], runScope = DEFAULT_RUN_SCOPE }) {
    const landlordSequelize = createSourceConnection(config);
    const landlordSnapshot = await readLegacyLandlordSnapshot(landlordSequelize, targets);

    const mappedLegacyKeys = await fetchMappedLegacyKeys(metaSequelize, runScope);

    const openFindings = await listOpenDataQualityFindings(metaSequelize, { runScope });
    const openFindingsCheck = checkOpenFindings(openFindings);

    let businessMemberships = [];
    try {
        businessMemberships = await selectAll(targetSequelize, 'business_memberships');
    } catch (error) {
        businessMemberships = [];
    }

    const targetVerifications = [];
    for (const target of targets) {
        const tenantMemberships = (landlordSnapshot.memberships || []).filter(
            (membership) => String(membership.tenant_id) === String(target.legacy_tenant_id)
        );

        // eslint-disable-next-line no-await-in-loop
        const targetVerification = await buildTargetDataVerification({
            config,
            target,
            tenantMemberships,
            businessMemberships,
            mappedLegacyKeys,
            openFindings
        });

        targetVerifications.push(targetVerification);
    }

    let storefrontProjection;
    try {
        const rows = await selectAll(targetSequelize, 'storefront_discovery_index');
        storefrontProjection = summarizeStorefrontDiscoveryProjection(rows);
    } catch (error) {
        storefrontProjection = summarizeStorefrontDiscoveryProjection([]);
    }

    const dataMigrationOk = targetVerifications.every((entry) => entry.ok) && openFindingsCheck.ok;

    return {
        data_migration: {
            run_scope: runScope,
            targets: targetVerifications,
            open_findings: openFindingsCheck,
            storefront_discovery_projection: storefrontProjection,
            ok: dataMigrationOk
        }
    };
}
