/**
 * Phase 03 Plan 02 (MIG-01, T-03-02-02): pure legacy-to-DGFY source-to-target
 * mapping functions.
 *
 * Single source of truth for the transform rules documented in
 * `docs/database/dgfy-data-migration-map.md`. Dry-run (03-03) and apply
 * (03-04) both call these exact functions so their behavior can never drift
 * (03-RESEARCH.md Pitfall 2).
 *
 * Hard contract (verified by this module's own tests, per the plan's
 * threat model):
 * - Zero imports. No Sequelize, mysql2, filesystem, or backend module
 *   access — every function is a pure transform of its arguments.
 * - No SQL is constructed here; SQL/parameterization is entirely the
 *   caller's (metadata/dataState.js's) responsibility.
 * - Membership/assignment mappers only ever branch on
 *   `status === 'accepted'` — never on matching email/phone (ADR 0028).
 * - Terminal identity payloads are built field-by-field from an explicit
 *   allow-list; secrets present on the source entry can never leak into
 *   `target_payload` because the builder never reads those source fields.
 *
 * Every mapper returns:
 * {
 *   operation: 'insert' | 'update' | 'skip' | 'conflict',
 *   entity_type: string,
 *   target_table: string | null,
 *   target_database: string | null,
 *   target_payload: object | null,
 *   legacy_id_map_key: { legacy_source, legacy_table, legacy_id } | null,
 *   related_targets: Array<{ operation, entity_type, target_table, target_database, target_payload }>,
 *   findings: Array<{ entity_type, legacy_table, legacy_id, severity, reason_code, message, remediation }>
 * }
 */

// D-04: stable reason codes shared by every mapper's findings and by
// dry-run/apply/verify report sections (docs/database/dgfy-data-migration-map.md
// "Operation and severity taxonomy").
export const MAPPING_REASON_CODES = Object.freeze({
    MISSING_REQUIRED_FIELD: 'missing_required_field',
    MISSING_ACCEPTED_MEMBERSHIP: 'missing_accepted_membership',
    MISSING_OWNER_EVIDENCE: 'missing_owner_evidence',
    OWNER_MISMATCH: 'owner_mismatch',
    DUPLICATE_EMAIL: 'duplicate_email',
    INVALID_TERMINAL_ID: 'invalid_terminal_id',
    ORPHAN_TENANT_USER_LINK: 'orphan_tenant_user_link',
    LOCATION_NOT_MAPPED: 'location_not_mapped',
    OUT_OF_SCOPE_ENTITY: 'out_of_scope_entity',
    STAFF_CREDENTIAL_RESET_REQUIRED: 'staff_credential_reset_required',
    LOSSY_CATEGORY_COLLAPSE: 'lossy_category_collapse',
    FOLDER_NESTING_FLATTENED: 'folder_nesting_flattened',
    UNRESOLVED_INGREDIENT: 'unresolved_ingredient'
});

// D-15/ADR 0029: mirrors dgfyCoreContract.js / dgfyBusinessContract.js
// rejectedTables — product, inventory, POS, fiscal, promo, and Storefront
// operational domains are never migrated in Phase 03
// (docs/database/dgfy-data-migration-map.md "Explicit Exclusions").
// v2.1 (LDM-01/D-11, Phase 12): 'items', 'stock_movements', and
// 'pos_transactions' are now in scope starting Phase 13. Phase 13 also brings
// 'item_location_stocks' into scope per D-10/PIM-05 as synthesized opening-
// balance rows; 'pos_transaction_lines' remains out of scope until Phase 14
// (SHM-02).
export const OUT_OF_SCOPE_LEGACY_TABLES = Object.freeze([
    'products',
    'skus',
    'product_variants',
    'categories',
    'purchase_orders',
    'job_orders',
    'fifo_batches',
    'suppliers',
    'supplier_items',
    'pos_transaction_lines',
    'shifts',
    'cashier_sessions',
    'terminal_sessions',
    'discounts',
    'promos',
    'promotions',
    'fiscal_receipts',
    'fiscal_compliance_logs',
    'checkout_sessions',
    'storefront_pages',
    'storefront_orders',
    'storefront_carts'
]);

const TERMINAL_ID_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,39}$/;
const REAL_BCRYPT_HASH_PATTERN = /^\$2[abxy]\$\d{2}\$/;

export const MOVEMENT_TYPE_MAP = Object.freeze({
    purchase_receipt: 'restock',
    calculated_loss: 'loss',
    adjustment: 'adjustment',
    goods_issue: 'sale',
    return: 'restock',
    production_consumption: 'adjustment',
    production_output: 'adjustment',
    transfer: null
});

function isBlank(value) {
    return value === undefined || value === null || String(value).trim() === '';
}

function toTrimmedString(value) {
    return value === undefined || value === null ? '' : String(value).trim();
}

function toKeyString(value) {
    return value === undefined || value === null ? null : String(value);
}

export function isRealBcryptHash(value) {
    return typeof value === 'string' && REAL_BCRYPT_HASH_PATTERN.test(value);
}

function legacyIdMapKey({ legacySource, legacyTable, legacyId }) {
    return {
        legacy_source: legacySource,
        legacy_table: legacyTable,
        legacy_id: toKeyString(legacyId)
    };
}

/**
 * Builds a structured skip/conflict/orphan finding. Every mapper below uses
 * this instead of constructing ad-hoc objects, so dry-run/apply/verify
 * always see the same finding shape (D-04: never silently dropped).
 */
export function classifyMappingConflict(reasonCode, {
    entityType,
    legacyTable = null,
    legacyId = null,
    severity = 'conflict',
    message,
    remediation = null
} = {}) {
    return {
        entity_type: entityType,
        legacy_table: legacyTable,
        legacy_id: toKeyString(legacyId),
        severity,
        reason_code: reasonCode,
        message,
        remediation
    };
}

/**
 * Returns false for any legacy table explicitly excluded from Phase 03
 * migration (ADR 0029). Used by dry-run/apply to guard against accidentally
 * processing an out-of-scope source table.
 */
export function isInScopeLegacyTable(legacyTable) {
    return !OUT_OF_SCOPE_LEGACY_TABLES.includes(toTrimmedString(legacyTable));
}

/**
 * Builds the structured "ignored, not silently dropped" result for a record
 * from an explicitly out-of-scope legacy table (docs/database/dgfy-data-migration-map.md
 * "Explicit Exclusions").
 */
export function classifyOutOfScopeRecord(legacyTable, legacyId = null) {
    return {
        operation: 'skip',
        entity_type: 'out_of_scope',
        target_table: null,
        target_database: null,
        target_payload: null,
        legacy_id_map_key: null,
        related_targets: [],
        findings: [classifyMappingConflict(MAPPING_REASON_CODES.OUT_OF_SCOPE_ENTITY, {
            entityType: 'out_of_scope',
            legacyTable,
            legacyId,
            severity: 'skip',
            message: `Legacy table "${legacyTable}" is explicitly out of scope for Phase 03 migration (ADR 0029) and was ignored.`,
            remediation: 'No migration action required; this domain is deferred to a later milestone.'
        })]
    };
}

function skipResult({ entityType, targetTable, legacyIdMapKeyValue, finding }) {
    return {
        operation: 'skip',
        entity_type: entityType,
        target_table: targetTable,
        target_database: null,
        target_payload: null,
        legacy_id_map_key: legacyIdMapKeyValue,
        related_targets: [],
        findings: [finding]
    };
}

function toDecimalNumber(value) {
    if (value === undefined || value === null || String(value).trim() === '') return null;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
}

function toDecimalString(value) {
    const numberValue = toDecimalNumber(value);
    return numberValue === null ? null : numberValue.toFixed(12);
}

export function computeOpeningBalanceQuantity(legacyItem = {}, itemLocationStocks = []) {
    if (Array.isArray(itemLocationStocks) && itemLocationStocks.length > 0) {
        const total = itemLocationStocks.reduce((sum, row) => {
            const quantity = toDecimalNumber(row?.quantity_on_hand);
            return sum + (quantity === null ? 0 : quantity);
        }, 0);
        return total.toFixed(12);
    }

    return toDecimalString(legacyItem.current_stock);
}

function addAttributeIfPresent(attributes, key, value) {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
        if (value.length > 0) attributes[key] = value;
        return;
    }
    attributes[key] = value;
}

function buildProductAttributes(legacyItem = {}) {
    const attributes = {};
    const objectAttributeSources = [
        ['nutrition', 'nutrition'],
        ['physicalProperties', 'physicalProperties'],
        ['shelfLife', 'shelfLife'],
        ['packaging', 'packaging'],
        ['qualityControl', 'qualityControl'],
        ['compliance', 'regulatoryCompliance'],
        ['costBreakdown', 'costBreakdown']
    ];
    const arrayAttributeSources = [
        ['allergens', 'allergens'],
        ['barcodes', 'barcodes'],
        ['composition', 'productCompositions']
    ];

    objectAttributeSources.forEach(([attributeKey, sourceKey]) => {
        addAttributeIfPresent(attributes, attributeKey, legacyItem[sourceKey]);
    });
    arrayAttributeSources.forEach(([attributeKey, sourceKey]) => {
        addAttributeIfPresent(attributes, attributeKey, legacyItem[sourceKey]);
    });

    return attributes;
}

// ---------------------------------------------------------------------------
// 1. Account identity — dgfy_accounts -> dgfy_core.accounts
// ---------------------------------------------------------------------------

export function mapLegacyAccountToDgfyAccount(legacyAccount = {}) {
    const legacyId = legacyAccount.id;
    const legacyIdMapKeyValue = legacyIdMapKey({
        legacySource: 'landlord',
        legacyTable: 'dgfy_accounts',
        legacyId
    });

    const email = toTrimmedString(legacyAccount.email).toLowerCase();
    const phone = toTrimmedString(legacyAccount.phone);
    const passwordHash = toTrimmedString(legacyAccount.password_hash);

    if (isBlank(email) || isBlank(phone) || isBlank(passwordHash)) {
        return skipResult({
            entityType: 'account',
            targetTable: 'accounts',
            legacyIdMapKeyValue,
            finding: classifyMappingConflict(MAPPING_REASON_CODES.MISSING_REQUIRED_FIELD, {
                entityType: 'account',
                legacyTable: 'dgfy_accounts',
                legacyId,
                severity: 'skip',
                message: `Legacy dgfy_accounts row ${legacyId} is missing a required field (email, phone, or password_hash).`,
                remediation: 'Backfill the missing field on the legacy landlord account before retrying migration.'
            })
        });
    }

    const status = legacyAccount.deleted_at
        ? 'deleted'
        : legacyAccount.is_active === false
            ? 'suspended'
            : 'active';

    return {
        operation: 'insert',
        entity_type: 'account',
        target_table: 'accounts',
        target_database: 'dgfy_core',
        target_payload: {
            id: legacyAccount.id,
            first_name: toTrimmedString(legacyAccount.first_name),
            last_name: toTrimmedString(legacyAccount.last_name),
            email,
            phone,
            password_hash: legacyAccount.password_hash,
            status,
            email_verified_at: legacyAccount.email_verified_at || null,
            phone_verified_at: legacyAccount.phone_verified_at || null,
            last_login_at: legacyAccount.last_login_at || null
        },
        legacy_id_map_key: legacyIdMapKeyValue,
        related_targets: [],
        deferred_fields: {
            middle_name: legacyAccount.middle_name ?? null,
            username: legacyAccount.username ?? null,
            provisioning_status: legacyAccount.provisioning_status ?? null,
            temporary_password_active: legacyAccount.temporary_password_active ?? null,
            email_verification_source: legacyAccount.email_verification_source ?? null,
            merchant_terms_acknowledged_at: legacyAccount.merchant_terms_acknowledged_at ?? null,
            business_step_up_verified_at: legacyAccount.business_step_up_verified_at ?? null,
            deleted_by: legacyAccount.deleted_by ?? null,
            deletion_reason: legacyAccount.deletion_reason ?? null
        },
        findings: []
    };
}

// ---------------------------------------------------------------------------
// 2. Tenant / business — tenants -> dgfy_core.businesses (+ registry, +
//    tenant_ownership_metadata related writes)
// ---------------------------------------------------------------------------

const TENANT_STATUS_MAP = Object.freeze({
    pending: 'pending',
    active: 'active',
    inactive: 'inactive',
    archived: 'archived',
    rejected: 'archived'
});

export function mapLegacyTenantToBusiness(legacyTenant = {}, target = {}) {
    const { targetBusinessDbName, expectedBusinessId, expectedOwnerAccountId } = target;
    const legacyId = legacyTenant.id;
    const legacyIdMapKeyValue = legacyIdMapKey({
        legacySource: 'landlord',
        legacyTable: 'tenants',
        legacyId
    });

    const name = toTrimmedString(legacyTenant.name);
    const missingManifestFields = ['targetBusinessDbName', 'expectedBusinessId', 'expectedOwnerAccountId']
        .filter((field) => isBlank(target[field]));

    if (isBlank(name) || missingManifestFields.length > 0) {
        return skipResult({
            entityType: 'business',
            targetTable: 'businesses',
            legacyIdMapKeyValue,
            finding: classifyMappingConflict(MAPPING_REASON_CODES.MISSING_REQUIRED_FIELD, {
                entityType: 'business',
                legacyTable: 'tenants',
                legacyId,
                severity: 'skip',
                message: `Legacy tenant ${legacyId} is missing a required field (name) or the migration target manifest entry is incomplete (${missingManifestFields.join(', ') || 'name'}).`,
                remediation: 'Backfill the legacy tenant name or complete the migration target manifest entry before retrying.'
            })
        });
    }

    const stableOpaqueSuffix = targetBusinessDbName.replace(/^dgfy_business_/, '');
    const legacyStatus = toTrimmedString(legacyTenant.status) || 'pending';
    const status = TENANT_STATUS_MAP[legacyStatus] || 'pending';

    const relatedTargets = [
        {
            operation: 'insert',
            entity_type: 'business_database_registry',
            target_table: 'business_database_registry',
            target_database: 'dgfy_core',
            target_payload: {
                business_id: expectedBusinessId,
                stable_opaque_suffix: stableOpaqueSuffix,
                database_name: targetBusinessDbName,
                status: 'active',
                verified_at: null
            }
        }
    ];

    const findings = [];
    const legacyOwnerAccountId = legacyTenant.owner_dgfy_account_id;

    if (isBlank(legacyOwnerAccountId)) {
        findings.push(classifyMappingConflict(MAPPING_REASON_CODES.MISSING_OWNER_EVIDENCE, {
            entityType: 'tenant_ownership_metadata',
            legacyTable: 'tenants',
            legacyId,
            severity: 'conflict',
            message: `Legacy tenant ${legacyId} has no owner_dgfy_account_id; tenant_ownership_metadata cannot be written without explicit owner evidence (ADR 0028).`,
            remediation: 'Resolve tenant ownership (platform-admin assignment or founder membership bootstrap) before retrying.'
        }));
    } else if (String(legacyOwnerAccountId) !== String(expectedOwnerAccountId)) {
        findings.push(classifyMappingConflict(MAPPING_REASON_CODES.OWNER_MISMATCH, {
            entityType: 'tenant_ownership_metadata',
            legacyTable: 'tenants',
            legacyId,
            severity: 'conflict',
            message: `Legacy tenant ${legacyId} owner_dgfy_account_id does not match the migration target manifest's expected_owner_account_id.`,
            remediation: 'Correct the migration target manifest or re-verify the legacy tenant owner before retrying.'
        }));
    } else {
        relatedTargets.push({
            operation: 'insert',
            entity_type: 'tenant_ownership_metadata',
            target_table: 'tenant_ownership_metadata',
            target_database: targetBusinessDbName,
            target_payload: {
                business_id: expectedBusinessId,
                business_handle: stableOpaqueSuffix,
                stable_opaque_suffix: stableOpaqueSuffix,
                owner_dgfy_account_id: expectedOwnerAccountId
            }
        });
    }

    return {
        operation: 'insert',
        entity_type: 'business',
        target_table: 'businesses',
        target_database: 'dgfy_core',
        target_payload: {
            id: expectedBusinessId,
            business_handle: stableOpaqueSuffix,
            legal_name: name,
            display_name: name,
            status
        },
        legacy_id_map_key: legacyIdMapKeyValue,
        related_targets: relatedTargets,
        deferred_fields: {
            domain: legacyTenant.domain ?? null,
            subdomain: legacyTenant.subdomain ?? null,
            plan: legacyTenant.plan ?? null,
            compliance_profile: legacyTenant.compliance_profile ?? null
        },
        findings
    };
}

// ---------------------------------------------------------------------------
// 3. Business membership — dgfy_account_tenant_memberships -> dgfy_core.business_memberships
// ---------------------------------------------------------------------------

const BUSINESS_MEMBERSHIP_ROLE_MAP = Object.freeze({
    owner: 'owner',
    founder: 'owner',
    admin: 'manager',
    manager: 'manager'
});

function mapBusinessMembershipRole(rawRole) {
    const normalized = toTrimmedString(rawRole).toLowerCase();
    return BUSINESS_MEMBERSHIP_ROLE_MAP[normalized] || 'member';
}

export function mapLegacyMembershipToBusinessMembership(legacyMembership = {}, target = {}) {
    const { expectedBusinessId } = target;
    const legacyId = legacyMembership.id;
    const legacyIdMapKeyValue = legacyIdMapKey({
        legacySource: 'landlord',
        legacyTable: 'dgfy_account_tenant_memberships',
        legacyId
    });

    // ADR 0028: the ONLY gate is an explicit accepted membership row. This
    // function never inspects account/user email or phone fields.
    if (legacyMembership.status !== 'accepted') {
        return skipResult({
            entityType: 'business_membership',
            targetTable: 'business_memberships',
            legacyIdMapKeyValue,
            finding: classifyMappingConflict(MAPPING_REASON_CODES.MISSING_ACCEPTED_MEMBERSHIP, {
                entityType: 'business_membership',
                legacyTable: 'dgfy_account_tenant_memberships',
                legacyId,
                severity: 'skip',
                message: `Legacy membership ${legacyId} has status "${legacyMembership.status}", not "accepted"; ADR 0028 requires an explicit accepted membership, never an email/phone inference.`,
                remediation: 'Wait for the DGFY account to accept the invitation, or exclude this membership from the run.'
            })
        });
    }

    if (isBlank(legacyMembership.dgfy_account_id) || isBlank(expectedBusinessId)) {
        return skipResult({
            entityType: 'business_membership',
            targetTable: 'business_memberships',
            legacyIdMapKeyValue,
            finding: classifyMappingConflict(MAPPING_REASON_CODES.MISSING_REQUIRED_FIELD, {
                entityType: 'business_membership',
                legacyTable: 'dgfy_account_tenant_memberships',
                legacyId,
                severity: 'skip',
                message: `Legacy membership ${legacyId} is missing dgfy_account_id, or the migration target manifest's expected_business_id is missing.`,
                remediation: 'Backfill the missing field before retrying migration.'
            })
        });
    }

    return {
        operation: 'insert',
        entity_type: 'business_membership',
        target_table: 'business_memberships',
        target_database: 'dgfy_core',
        target_payload: {
            account_id: legacyMembership.dgfy_account_id,
            business_id: expectedBusinessId,
            role: mapBusinessMembershipRole(legacyMembership.role),
            status: 'active'
        },
        legacy_id_map_key: legacyIdMapKeyValue,
        related_targets: [],
        findings: []
    };
}

// ---------------------------------------------------------------------------
// 4. Staff account — tenant-local users -> dgfy_business_*.staff_accounts
// ---------------------------------------------------------------------------

export function mapLegacyUserToStaffAccount(legacyUser = {}, context = {}) {
    const { legacyTenantDbName = 'legacy_tenant', targetBusinessDbName = null, seenEmails = new Set() } = context;
    const legacyId = legacyUser.user_id;
    const legacyIdMapKeyValue = legacyIdMapKey({
        legacySource: legacyTenantDbName,
        legacyTable: 'users',
        legacyId
    });

    const email = toTrimmedString(legacyUser.email).toLowerCase();

    if (isBlank(email)) {
        return skipResult({
            entityType: 'staff_account',
            targetTable: 'staff_accounts',
            legacyIdMapKeyValue,
            finding: classifyMappingConflict(MAPPING_REASON_CODES.MISSING_REQUIRED_FIELD, {
                entityType: 'staff_account',
                legacyTable: 'users',
                legacyId,
                severity: 'skip',
                message: `Legacy tenant user ${legacyId} is missing a required email.`,
                remediation: 'Backfill the missing email on the legacy tenant user before retrying migration.'
            })
        });
    }

    if (seenEmails.has(email)) {
        return {
            operation: 'conflict',
            entity_type: 'staff_account',
            target_table: 'staff_accounts',
            target_database: targetBusinessDbName,
            target_payload: null,
            legacy_id_map_key: legacyIdMapKeyValue,
            related_targets: [],
            findings: [classifyMappingConflict(MAPPING_REASON_CODES.DUPLICATE_EMAIL, {
                entityType: 'staff_account',
                legacyTable: 'users',
                legacyId,
                severity: 'conflict',
                message: `Legacy tenant user ${legacyId} email "${email}" duplicates an email already mapped to a staff_accounts row in this run.`,
                remediation: 'Resolve the duplicate email in the legacy tenant users table before retrying.'
            })]
        };
    }

    const displayName = toTrimmedString(legacyUser.username) || email.split('@')[0];
    const status = legacyUser.deleted_at
        ? 'removed'
        : legacyUser.is_active === false
            ? 'suspended'
            : 'active';
    const hasRealPasswordHash = isRealBcryptHash(legacyUser.password_hash);
    const hasRealPinHash = isRealBcryptHash(legacyUser.pos_approval_pin_hash);
    const credentialStatus = hasRealPasswordHash ? 'active' : 'reset_required';
    const credentialPayload = {
        password_hash: hasRealPasswordHash ? legacyUser.password_hash : null,
        pos_approval_pin_hash: hasRealPinHash ? legacyUser.pos_approval_pin_hash : null,
        credential_status: credentialStatus,
        password_updated_at: null
    };
    const findings = [];

    if (credentialStatus === 'reset_required') {
        const message = legacyUser.password_hash === 'PENDING_INVITATION'
            ? `Legacy tenant user ${legacyId} has a pending legacy invitation credential marker, so no password hash can be migrated.`
            : `Legacy tenant user ${legacyId} has no supported bcrypt password hash, so tenant-local credential reset is required.`;

        findings.push(classifyMappingConflict(MAPPING_REASON_CODES.STAFF_CREDENTIAL_RESET_REQUIRED, {
            entityType: 'staff_credential',
            legacyTable: 'users',
            legacyId,
            severity: 'skip',
            message,
            remediation: 'Reinvite or reset this staff member through the tenant-local staff_invitations credential setup flow.'
        }));
    }

    return {
        operation: 'insert',
        entity_type: 'staff_account',
        target_table: 'staff_accounts',
        target_database: targetBusinessDbName,
        target_payload: {
            display_name: displayName,
            email,
            phone: toTrimmedString(legacyUser.phone_number) || null,
            status,
            is_master_admin: legacyUser.is_master_admin === true
        },
        legacy_id_map_key: legacyIdMapKeyValue,
        deferred_fields: {
            role: legacyUser.role ?? null,
            role_preset_key: legacyUser.role_preset_key ?? null,
            permissions: legacyUser.permissions ?? null
        },
        related_targets: [
            {
                operation: 'insert',
                entity_type: 'staff_credential',
                target_table: 'staff_credentials',
                target_database: targetBusinessDbName,
                target_payload: credentialPayload
            }
        ],
        findings
    };
}

// ---------------------------------------------------------------------------
// 5. Account-staff assignment — dgfy_account_tenant_memberships (accepted) ->
//    dgfy_business_*.account_staff_assignments
// ---------------------------------------------------------------------------

const ASSIGNMENT_ROLE_MAP = Object.freeze({
    owner: 'owner',
    founder: 'owner',
    admin: 'manager',
    manager: 'manager'
});

function mapAssignmentRole(rawRole) {
    const normalized = toTrimmedString(rawRole).toLowerCase();
    return ASSIGNMENT_ROLE_MAP[normalized] || 'staff';
}

export function mapLegacyAccountStaffAssignment(legacyMembership = {}, target = {}) {
    const { staffAccountId = null, targetBusinessDbName = null } = target;
    const legacyId = legacyMembership.id;
    const legacyIdMapKeyValue = legacyIdMapKey({
        legacySource: 'landlord',
        legacyTable: 'dgfy_account_tenant_memberships',
        legacyId
    });

    // ADR 0028: identical non-inference gate as mapLegacyMembershipToBusinessMembership —
    // this function never inspects account/user email or phone fields.
    if (legacyMembership.status !== 'accepted') {
        return skipResult({
            entityType: 'account_staff_assignment',
            targetTable: 'account_staff_assignments',
            legacyIdMapKeyValue,
            finding: classifyMappingConflict(MAPPING_REASON_CODES.MISSING_ACCEPTED_MEMBERSHIP, {
                entityType: 'account_staff_assignment',
                legacyTable: 'dgfy_account_tenant_memberships',
                legacyId,
                severity: 'skip',
                message: `Legacy membership ${legacyId} has status "${legacyMembership.status}", not "accepted"; ADR 0028 requires an explicit accepted membership, never an email/phone inference.`,
                remediation: 'Wait for the DGFY account to accept the invitation, or exclude this membership from the run.'
            })
        });
    }

    if (isBlank(legacyMembership.tenant_user_id)) {
        return skipResult({
            entityType: 'account_staff_assignment',
            targetTable: 'account_staff_assignments',
            legacyIdMapKeyValue,
            finding: classifyMappingConflict(MAPPING_REASON_CODES.ORPHAN_TENANT_USER_LINK, {
                entityType: 'account_staff_assignment',
                legacyTable: 'dgfy_account_tenant_memberships',
                legacyId,
                severity: 'orphan',
                message: `Legacy membership ${legacyId} is accepted but has no tenant_user_id; there is no legacy tenant-local user link to resolve, and this mapper never falls back to matching by email.`,
                remediation: 'Repair the membership\'s tenant_user_id link (see dgfyTenantSessionService.js\'s gated email-repair escape hatch) before retrying migration.'
            })
        });
    }

    if (isBlank(staffAccountId)) {
        return skipResult({
            entityType: 'account_staff_assignment',
            targetTable: 'account_staff_assignments',
            legacyIdMapKeyValue,
            finding: classifyMappingConflict(MAPPING_REASON_CODES.ORPHAN_TENANT_USER_LINK, {
                entityType: 'account_staff_assignment',
                legacyTable: 'dgfy_account_tenant_memberships',
                legacyId,
                severity: 'orphan',
                message: `Legacy membership ${legacyId} has tenant_user_id ${legacyMembership.tenant_user_id} but no resolved staff_accounts.id was supplied; the tenant user has not been migrated (or ID-mapped) yet.`,
                remediation: 'Migrate this tenant\'s staff accounts (entity 4) before mapping account-staff assignments.'
            })
        });
    }

    return {
        operation: 'insert',
        entity_type: 'account_staff_assignment',
        target_table: 'account_staff_assignments',
        target_database: targetBusinessDbName,
        target_payload: {
            dgfy_account_id: legacyMembership.dgfy_account_id,
            staff_account_id: staffAccountId,
            role: mapAssignmentRole(legacyMembership.role),
            status: 'active'
        },
        legacy_id_map_key: legacyIdMapKeyValue,
        related_targets: [],
        findings: []
    };
}

// ---------------------------------------------------------------------------
// 6. Location / branch — tenant_locations -> dgfy_business_*.locations
// ---------------------------------------------------------------------------

export function mapLegacyLocationToLocation(legacyLocation = {}, context = {}) {
    const { legacyTenantDbName = 'legacy_tenant', targetBusinessDbName = null } = context;
    const legacyId = legacyLocation.location_id;
    const legacyIdMapKeyValue = legacyIdMapKey({
        legacySource: legacyTenantDbName,
        legacyTable: 'tenant_locations',
        legacyId
    });

    const name = toTrimmedString(legacyLocation.name);
    const addressLine = toTrimmedString(legacyLocation.address_line);

    if (isBlank(name)) {
        return skipResult({
            entityType: 'location',
            targetTable: 'locations',
            legacyIdMapKeyValue,
            finding: classifyMappingConflict(MAPPING_REASON_CODES.MISSING_REQUIRED_FIELD, {
                entityType: 'location',
                legacyTable: 'tenant_locations',
                legacyId,
                severity: 'skip',
                message: `Legacy tenant_locations row ${legacyId} is missing a required name.`,
                remediation: 'Backfill the location name on the legacy tenant record before retrying migration.'
            })
        });
    }

    if (isBlank(addressLine)) {
        return skipResult({
            entityType: 'location',
            targetTable: 'locations',
            legacyIdMapKeyValue,
            finding: classifyMappingConflict(MAPPING_REASON_CODES.MISSING_REQUIRED_FIELD, {
                entityType: 'location',
                legacyTable: 'tenant_locations',
                legacyId,
                severity: 'skip',
                message: `Legacy tenant_locations row ${legacyId} is missing a required address_line.`,
                remediation: 'Backfill the location address on the legacy tenant record before retrying migration.'
            })
        });
    }

    return {
        operation: 'insert',
        entity_type: 'location',
        target_table: 'locations',
        target_database: targetBusinessDbName,
        target_payload: {
            name,
            address_line: addressLine,
            latitude: legacyLocation.latitude ?? null,
            longitude: legacyLocation.longitude ?? null,
            is_active: legacyLocation.is_active !== false,
            is_primary: legacyLocation.is_primary_storefront === true
        },
        legacy_id_map_key: legacyIdMapKeyValue,
        related_targets: [],
        findings: []
    };
}

// ---------------------------------------------------------------------------
// 7. Terminal identity — system_settings.pos_terminal_registry ->
//    dgfy_business_*.terminal_identities
// ---------------------------------------------------------------------------

function sanitizeTerminalId(value) {
    return String(value || '').trim().toUpperCase();
}

export function mapTerminalRegistryEntryToTerminalIdentity(entry = {}, context = {}) {
    const { legacyTenantDbName = 'legacy_tenant', targetBusinessDbName = null, locationId = null } = context;
    const legacyId = entry.terminal_id;
    const legacyIdMapKeyValue = legacyIdMapKey({
        legacySource: legacyTenantDbName,
        legacyTable: 'system_settings.pos_terminal_registry',
        legacyId
    });

    const terminalCode = sanitizeTerminalId(entry.terminal_id);

    if (!TERMINAL_ID_PATTERN.test(terminalCode)) {
        return skipResult({
            entityType: 'terminal_identity',
            targetTable: 'terminal_identities',
            legacyIdMapKeyValue,
            finding: classifyMappingConflict(MAPPING_REASON_CODES.INVALID_TERMINAL_ID, {
                entityType: 'terminal_identity',
                legacyTable: 'system_settings.pos_terminal_registry',
                legacyId,
                severity: 'skip',
                message: `Legacy pos_terminal_registry entry "${entry.terminal_id}" does not match the required terminal code pattern.`,
                remediation: 'Correct the terminal_id in the legacy tenant\'s pos_terminal_registry setting before retrying migration.'
            })
        });
    }

    const findings = [];
    if (!isBlank(entry.location_id) && isBlank(locationId)) {
        findings.push(classifyMappingConflict(MAPPING_REASON_CODES.LOCATION_NOT_MAPPED, {
            entityType: 'terminal_identity',
            legacyTable: 'system_settings.pos_terminal_registry',
            legacyId,
            severity: 'orphan',
            message: `Terminal "${terminalCode}" references legacy location_id ${entry.location_id}, but no resolved target locations.id was supplied; migrated with location_id: null.`,
            remediation: 'Migrate this tenant\'s locations (entity 6) before mapping terminal identities, or accept the terminal without a location binding.'
        }));
    }

    return {
        operation: 'insert',
        entity_type: 'terminal_identity',
        target_table: 'terminal_identities',
        target_database: targetBusinessDbName,
        // Explicit allow-list — never reads terminal_password_hash,
        // pairing_version, cashier_email, is_default, or any shift/
        // transaction/fiscal field from `entry` (threat model: "Secret
        // leakage in reports").
        target_payload: {
            terminal_code: terminalCode,
            label: toTrimmedString(entry.label),
            location_id: locationId,
            status: entry.is_active === false ? 'inactive' : 'active'
        },
        legacy_id_map_key: legacyIdMapKeyValue,
        related_targets: [],
        findings
    };
}

// ---------------------------------------------------------------------------
// 8. Product folder — item_folders -> dgfy_business_*.product_folders
// ---------------------------------------------------------------------------

export function mapItemFolderToProductFolder(legacyFolder = {}, context = {}) {
    const {
        legacyTenantDbName = 'legacy_tenant',
        targetBusinessDbName = null,
        expectedBusinessId = null
    } = context;
    const legacyId = legacyFolder.folder_id;
    const legacyIdMapKeyValue = legacyIdMapKey({
        legacySource: legacyTenantDbName,
        legacyTable: 'item_folders',
        legacyId
    });

    const name = toTrimmedString(legacyFolder.name);

    if (isBlank(name)) {
        return skipResult({
            entityType: 'product_folder',
            targetTable: 'product_folders',
            legacyIdMapKeyValue,
            finding: classifyMappingConflict(MAPPING_REASON_CODES.MISSING_REQUIRED_FIELD, {
                entityType: 'product_folder',
                legacyTable: 'item_folders',
                legacyId,
                severity: 'skip',
                message: `Legacy item_folders row ${legacyId} is missing a required name.`,
                remediation: 'Backfill the legacy folder name before retrying product-folder migration.'
            })
        });
    }

    const findings = [];
    if (!isBlank(legacyFolder.parent_id)) {
        findings.push(classifyMappingConflict(MAPPING_REASON_CODES.FOLDER_NESTING_FLATTENED, {
            entityType: 'product_folder',
            legacyTable: 'item_folders',
            legacyId,
            severity: 'skip',
            message: `Legacy item_folders row ${legacyId} has parent_id ${legacyFolder.parent_id}; product_folders is flat, so nesting is discarded while preserving the folder row.`,
            remediation: 'No migration action required; folder nesting is intentionally flattened for Phase 13.'
        }));
    }

    return {
        operation: 'insert',
        entity_type: 'product_folder',
        target_table: 'product_folders',
        target_database: targetBusinessDbName,
        target_payload: {
            business_id: expectedBusinessId,
            name,
            description: legacyFolder.description ?? null,
            show_in_pos_filter: true,
            is_active: true
        },
        legacy_id_map_key: legacyIdMapKeyValue,
        related_targets: [],
        findings
    };
}

// ---------------------------------------------------------------------------
// 9. Product — items -> dgfy_business_*.products
// ---------------------------------------------------------------------------

export function mapItemToProduct(legacyItem = {}, context = {}) {
    const {
        legacyTenantDbName = 'legacy_tenant',
        targetBusinessDbName = null,
        expectedBusinessId = null,
        resolvedFolderId = null,
        itemLocationStocks = []
    } = context;
    const legacyId = legacyItem.item_id;
    const legacyIdMapKeyValue = legacyIdMapKey({
        legacySource: legacyTenantDbName,
        legacyTable: 'items',
        legacyId
    });

    const name = toTrimmedString(legacyItem.name);

    if (isBlank(name)) {
        return skipResult({
            entityType: 'product',
            targetTable: 'products',
            legacyIdMapKeyValue,
            finding: classifyMappingConflict(MAPPING_REASON_CODES.MISSING_REQUIRED_FIELD, {
                entityType: 'product',
                legacyTable: 'items',
                legacyId,
                severity: 'skip',
                message: `Legacy items row ${legacyId} is missing a required name.`,
                remediation: 'Backfill the legacy item name before retrying product migration.'
            })
        });
    }

    return {
        operation: 'insert',
        entity_type: 'product',
        target_table: 'products',
        target_database: targetBusinessDbName,
        target_payload: {
            business_id: expectedBusinessId,
            folder_id: resolvedFolderId ?? null,
            name,
            // D-09: legacy inventory/material categories collapse to one
            // sellable DGFY category. Do not reintroduce a whitelist switch.
            category: 'retail',
            inventory_mode: 'basic_inventory',
            stock_count: computeOpeningBalanceQuantity(legacyItem, itemLocationStocks),
            sku_code: legacyItem.sku_code ?? null,
            description: legacyItem.description ?? null,
            unit_of_measure: legacyItem.unit_of_measure ?? null,
            cost_per_unit: legacyItem.cost_per_unit ?? null,
            vat_type: 'vatable',
            senior_pwd_discount_eligible: false,
            attributes: buildProductAttributes(legacyItem)
        },
        legacy_id_map_key: legacyIdMapKeyValue,
        related_targets: [],
        findings: []
    };
}

// ---------------------------------------------------------------------------
// 10. Inventory movement — stock_movements ->
//     dgfy_business_*.inventory_movements
// ---------------------------------------------------------------------------

export function mapStockMovementToInventoryMovement(legacyMovement = {}, context = {}) {
    const {
        legacyTenantDbName = 'legacy_tenant',
        targetBusinessDbName = null,
        expectedBusinessId = null,
        resolvedProductId = null
    } = context;
    const legacyId = legacyMovement.movement_id;
    const legacyIdMapKeyValue = legacyIdMapKey({
        legacySource: legacyTenantDbName,
        legacyTable: 'stock_movements',
        legacyId
    });
    const mappedMovementType = MOVEMENT_TYPE_MAP[legacyMovement.movement_type];

    if (mappedMovementType === null) {
        return skipResult({
            entityType: 'inventory_movement',
            targetTable: 'inventory_movements',
            legacyIdMapKeyValue,
            finding: classifyMappingConflict(MAPPING_REASON_CODES.LOSSY_CATEGORY_COLLAPSE, {
                entityType: 'inventory_movement',
                legacyTable: 'stock_movements',
                legacyId,
                severity: 'skip',
                message: `Legacy stock_movements row ${legacyId} is a transfer; inventory_movements has no location dimension, so no honest target row is inserted.`,
                remediation: 'No migration action required; this expected lossy collapse is documented by the Phase 13 movement-type remap decision.'
            })
        });
    }

    return {
        operation: 'insert',
        entity_type: 'inventory_movement',
        target_table: 'inventory_movements',
        target_database: targetBusinessDbName,
        target_payload: {
            business_id: expectedBusinessId,
            product_id: resolvedProductId,
            movement_type: mappedMovementType,
            quantity: legacyMovement.quantity,
            reference_type: 'legacy_stock_movement',
            reference_id: toKeyString(legacyId),
            actor_account_id: null,
            actor_staff_account_id: null,
            before_snapshot: null,
            after_snapshot: null
        },
        legacy_id_map_key: legacyIdMapKeyValue,
        related_targets: [],
        findings: []
    };
}

// ---------------------------------------------------------------------------
// 11. Opening balance — item_location_stocks/current_stock ->
//     dgfy_business_*.inventory_movements
// ---------------------------------------------------------------------------

export function mapItemLocationStocksToOpeningBalance(legacyItem = {}, context = {}) {
    const {
        legacyTenantDbName = 'legacy_tenant',
        targetBusinessDbName = null,
        expectedBusinessId = null,
        resolvedProductId = null,
        itemLocationStocks = []
    } = context;
    const legacyId = legacyItem.item_id;
    const legacyIdMapKeyValue = legacyIdMapKey({
        legacySource: legacyTenantDbName,
        legacyTable: 'item_location_stocks',
        legacyId
    });
    const quantity = computeOpeningBalanceQuantity(legacyItem, itemLocationStocks);

    if (quantity === null) {
        return {
            operation: 'skip',
            entity_type: 'inventory_movement',
            target_table: 'inventory_movements',
            target_database: null,
            target_payload: null,
            legacy_id_map_key: legacyIdMapKeyValue,
            related_targets: [],
            findings: []
        };
    }

    return {
        operation: 'insert',
        entity_type: 'inventory_movement',
        target_table: 'inventory_movements',
        target_database: targetBusinessDbName,
        target_payload: {
            business_id: expectedBusinessId,
            product_id: resolvedProductId,
            movement_type: 'adjustment',
            quantity,
            reference_type: 'legacy_opening_balance',
            reference_id: toKeyString(legacyId),
            actor_account_id: null,
            actor_staff_account_id: null,
            before_snapshot: null,
            after_snapshot: null
        },
        legacy_id_map_key: legacyIdMapKeyValue,
        related_targets: [],
        findings: []
    };
}

// ---------------------------------------------------------------------------
// 12. Product embedding — item_embeddings ->
//     dgfy_business_*.product_embeddings
// ---------------------------------------------------------------------------

export function mapItemEmbeddingToProductEmbedding(legacyEmbedding = {}, context = {}) {
    const {
        legacyTenantDbName = 'legacy_tenant',
        targetBusinessDbName = null,
        expectedBusinessId = null,
        resolvedProductId = null
    } = context;
    const legacyId = legacyEmbedding.embedding_id;
    const legacyIdMapKeyValue = legacyIdMapKey({
        legacySource: legacyTenantDbName,
        legacyTable: 'item_embeddings',
        legacyId
    });

    return {
        operation: 'insert',
        entity_type: 'product_embedding',
        target_table: 'product_embeddings',
        target_database: targetBusinessDbName,
        target_payload: {
            business_id: expectedBusinessId,
            product_id: resolvedProductId,
            vector: legacyEmbedding.vector,
            legacy_embedding_id: legacyEmbedding.embedding_id
        },
        legacy_id_map_key: legacyIdMapKeyValue,
        related_targets: [],
        findings: []
    };
}
