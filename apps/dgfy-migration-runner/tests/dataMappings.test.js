import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
    MAPPING_REASON_CODES,
    OUT_OF_SCOPE_LEGACY_TABLES,
    classifyMappingConflict,
    classifyOutOfScopeRecord,
    isRealBcryptHash,
    isInScopeLegacyTable,
    mapLegacyAccountToDgfyAccount,
    mapLegacyTenantToBusiness,
    mapLegacyMembershipToBusinessMembership,
    mapLegacyUserToStaffAccount,
    mapLegacyAccountStaffAssignment,
    mapLegacyLocationToLocation,
    mapTerminalRegistryEntryToTerminalIdentity
} from '../src/data/mappings.js';
import {
    migrationTargetContextFixture,
    legacyDgfyAccountFixture,
    legacyDgfyAccountMissingEmailFixture,
    legacyTenantFixture,
    legacyTenantMissingOwnerFixture,
    legacyTenantOwnerMismatchFixture,
    legacyAcceptedMembershipFixture,
    legacyMembershipMissingAcceptanceFixture,
    legacyMembershipMissingTenantUserLinkFixture,
    legacyTenantUserFixture,
    legacyTenantUserDuplicateEmailFixture,
    legacyTenantLocationFixture,
    legacyTenantLocationMissingNameFixture,
    legacyTenantLocationMissingAddressFixture,
    legacyPosTerminalRegistryEntryFixture,
    legacyPosTerminalRegistryEntryInvalidIdFixture,
    legacyPosTerminalRegistryEntryUnmappedLocationFixture,
    legacyExcludedPosTransactionFixture,
    legacyExcludedProductFixture,
    legacyExcludedFiscalReceiptFixture
} from './fixtures/phase03/legacyRecords.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Purity contract
// ---------------------------------------------------------------------------

describe('mappings.js purity contract', () => {
    test('has zero imports from backend, Sequelize, mysql2, or filesystem modules', () => {
        const source = readFileSync(join(__dirname, '..', 'src', 'data', 'mappings.js'), 'utf8');
        const importLines = source.match(/^import .*/gm) || [];

        expect(importLines).toHaveLength(0);
        expect(source.includes('require(')).toBe(false);
        expect(source.includes("from 'sequelize'")).toBe(false);
        expect(source.includes("from 'mysql2'")).toBe(false);
        expect(source.includes("from 'fs'")).toBe(false);
        expect(source.includes('backend/src')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// classifyMappingConflict / classifyOutOfScopeRecord / isInScopeLegacyTable
// ---------------------------------------------------------------------------

describe('classifyMappingConflict', () => {
    test('builds a structured finding with the given reason code and severity', () => {
        const finding = classifyMappingConflict(MAPPING_REASON_CODES.MISSING_REQUIRED_FIELD, {
            entityType: 'account',
            legacyTable: 'dgfy_accounts',
            legacyId: 42,
            severity: 'skip',
            message: 'missing email',
            remediation: 'backfill email'
        });

        expect(finding).toEqual({
            entity_type: 'account',
            legacy_table: 'dgfy_accounts',
            legacy_id: '42',
            severity: 'skip',
            reason_code: 'missing_required_field',
            message: 'missing email',
            remediation: 'backfill email'
        });
    });
});

describe('isInScopeLegacyTable / classifyOutOfScopeRecord (ADR 0029)', () => {
    test('every OUT_OF_SCOPE_LEGACY_TABLES entry is reported out of scope', () => {
        OUT_OF_SCOPE_LEGACY_TABLES.forEach((table) => {
            expect(isInScopeLegacyTable(table)).toBe(false);
        });
    });

    test('in-scope tables are not flagged out of scope', () => {
        ['dgfy_accounts', 'tenants', 'dgfy_account_tenant_memberships', 'users', 'tenant_locations', 'item_location_stocks'].forEach((table) => {
            expect(isInScopeLegacyTable(table)).toBe(true);
        });
    });

    test('classifyOutOfScopeRecord returns a skip result with out_of_scope_entity reason for a POS transaction', () => {
        const fixture = legacyExcludedPosTransactionFixture();
        const result = classifyOutOfScopeRecord('pos_transactions', fixture.pos_transaction_id);

        expect(result.operation).toBe('skip');
        expect(result.target_payload).toBeNull();
        expect(result.findings).toHaveLength(1);
        expect(result.findings[0].reason_code).toBe(MAPPING_REASON_CODES.OUT_OF_SCOPE_ENTITY);
    });

    test('classifyOutOfScopeRecord returns a skip result for a product and a fiscal receipt', () => {
        const productFixture = legacyExcludedProductFixture();
        const fiscalFixture = legacyExcludedFiscalReceiptFixture();

        expect(classifyOutOfScopeRecord('products', productFixture.item_id).operation).toBe('skip');
        expect(classifyOutOfScopeRecord('fiscal_receipts', fiscalFixture.fiscal_receipt_id).operation).toBe('skip');
    });

    test('mappings.js exports no mapper function for excluded fiscal, discount, or checkout domains', () => {
        // Phase 14 (SHM-02) explicitly brings `pos_transaction_lines` into
        // scope (removed from OUT_OF_SCOPE_LEGACY_TABLES) and adds
        // `mapPosTransactionLineToAvailmentItem`; fiscal receipts, discounts,
        // and checkout sessions remain out of scope and unmapped.
        const source = readFileSync(join(__dirname, '..', 'src', 'data', 'mappings.js'), 'utf8');
        const exportedFunctionNames = [...source.matchAll(/export function (\w+)/g)].map((match) => match[1]);

        expect(exportedFunctionNames.some((name) => /FiscalReceipt|Discount|Checkout/i.test(name))).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 1. Account identity
// ---------------------------------------------------------------------------

describe('mapLegacyAccountToDgfyAccount', () => {
    test('maps a happy-path legacy account to an insert with lowercased/trimmed contact fields', () => {
        const result = mapLegacyAccountToDgfyAccount(legacyDgfyAccountFixture());

        expect(result.operation).toBe('insert');
        expect(result.entity_type).toBe('account');
        expect(result.target_table).toBe('accounts');
        expect(result.target_database).toBe('dgfy_core');
        expect(result.target_payload.email).toBe('jane.doe@example.com');
        expect(result.target_payload.password_hash).toBe('$2b$10$abcdefghijklmnopqrstuv');
        expect(result.target_payload.status).toBe('active');
        expect(result.legacy_id_map_key).toEqual({
            legacy_source: 'landlord',
            legacy_table: 'dgfy_accounts',
            legacy_id: 'acct-uuid-1'
        });
        expect(result.findings).toEqual([]);
    });

    test('never re-hashes or omits password_hash (ASVS V2/V6)', () => {
        const account = legacyDgfyAccountFixture({ password_hash: '$2b$10$originalhash' });
        const result = mapLegacyAccountToDgfyAccount(account);

        expect(result.target_payload.password_hash).toBe('$2b$10$originalhash');
    });

    test('deferred_fields documents fields with no Phase 02 target column instead of silently dropping them', () => {
        const result = mapLegacyAccountToDgfyAccount(legacyDgfyAccountFixture({ username: 'janedoe', middle_name: 'M' }));

        expect(result.deferred_fields.username).toBe('janedoe');
        expect(result.deferred_fields.middle_name).toBe('M');
        expect(result.target_payload.username).toBeUndefined();
    });

    test('derives status: deleted_at present -> deleted', () => {
        const result = mapLegacyAccountToDgfyAccount(legacyDgfyAccountFixture({ deleted_at: '2026-07-01T00:00:00.000Z' }));
        expect(result.target_payload.status).toBe('deleted');
    });

    test('derives status: is_active false -> suspended', () => {
        const result = mapLegacyAccountToDgfyAccount(legacyDgfyAccountFixture({ is_active: false }));
        expect(result.target_payload.status).toBe('suspended');
        expect(['active', 'suspended', 'deleted']).toContain(result.target_payload.status);
    });

    test('missing required field (blank email) -> skip with missing_required_field finding', () => {
        const result = mapLegacyAccountToDgfyAccount(legacyDgfyAccountMissingEmailFixture());

        expect(result.operation).toBe('skip');
        expect(result.target_payload).toBeNull();
        expect(result.findings[0].reason_code).toBe(MAPPING_REASON_CODES.MISSING_REQUIRED_FIELD);
        expect(result.findings[0].severity).toBe('skip');
    });
});

// ---------------------------------------------------------------------------
// 2. Tenant / business
// ---------------------------------------------------------------------------

describe('mapLegacyTenantToBusiness', () => {
    test('happy path: insert business + business_database_registry + tenant_ownership_metadata related targets', () => {
        const result = mapLegacyTenantToBusiness(legacyTenantFixture(), migrationTargetContextFixture());

        expect(result.operation).toBe('insert');
        expect(result.target_table).toBe('businesses');
        expect(result.target_database).toBe('dgfy_core');
        expect(result.target_payload).toEqual({
            id: 'biz-uuid-1',
            business_handle: 'alpha',
            legal_name: "Jane's Cafe",
            display_name: "Jane's Cafe",
            status: 'active'
        });
        expect(result.legacy_id_map_key).toEqual({
            legacy_source: 'landlord',
            legacy_table: 'tenants',
            legacy_id: 'tenant-uuid-1'
        });

        const relatedEntityTypes = result.related_targets.map((entry) => entry.entity_type);
        expect(relatedEntityTypes).toEqual(['business_database_registry', 'tenant_ownership_metadata']);
        expect(result.related_targets[0].target_payload.database_name).toBe('dgfy_business_alpha');
        expect(result.related_targets[1].target_payload.owner_dgfy_account_id).toBe('acct-uuid-1');
        expect(result.findings).toEqual([]);
    });

    test('business_handle is derived from the manifest target DB name, never from tenant name (D-03)', () => {
        const result = mapLegacyTenantToBusiness(
            legacyTenantFixture({ name: 'A Completely Different Display Name Inc.' }),
            migrationTargetContextFixture({ targetBusinessDbName: 'dgfy_business_stableid42' })
        );

        expect(result.target_payload.business_handle).toBe('stableid42');
    });

    test('maps rejected tenant status to archived target status', () => {
        const result = mapLegacyTenantToBusiness(legacyTenantFixture({ status: 'rejected' }), migrationTargetContextFixture());
        expect(result.target_payload.status).toBe('archived');
    });

    test('missing owner evidence: business + registry still insert, ownership metadata omitted, conflict finding attached', () => {
        const result = mapLegacyTenantToBusiness(legacyTenantMissingOwnerFixture(), migrationTargetContextFixture());

        expect(result.operation).toBe('insert');
        const relatedEntityTypes = result.related_targets.map((entry) => entry.entity_type);
        expect(relatedEntityTypes).toEqual(['business_database_registry']);
        expect(relatedEntityTypes).not.toContain('tenant_ownership_metadata');
        expect(result.findings).toHaveLength(1);
        expect(result.findings[0].reason_code).toBe(MAPPING_REASON_CODES.MISSING_OWNER_EVIDENCE);
        expect(result.findings[0].severity).toBe('conflict');
    });

    test('owner mismatch against manifest: ownership metadata omitted, owner_mismatch conflict finding attached', () => {
        const result = mapLegacyTenantToBusiness(legacyTenantOwnerMismatchFixture(), migrationTargetContextFixture());

        const relatedEntityTypes = result.related_targets.map((entry) => entry.entity_type);
        expect(relatedEntityTypes).not.toContain('tenant_ownership_metadata');
        expect(result.findings[0].reason_code).toBe(MAPPING_REASON_CODES.OWNER_MISMATCH);
    });

    test('missing manifest field -> skip, no business row written', () => {
        const result = mapLegacyTenantToBusiness(legacyTenantFixture(), migrationTargetContextFixture({ expectedBusinessId: '' }));

        expect(result.operation).toBe('skip');
        expect(result.target_payload).toBeNull();
        expect(result.related_targets).toEqual([]);
        expect(result.findings[0].reason_code).toBe(MAPPING_REASON_CODES.MISSING_REQUIRED_FIELD);
    });

    test('missing tenant name -> skip', () => {
        const result = mapLegacyTenantToBusiness(legacyTenantFixture({ name: '' }), migrationTargetContextFixture());
        expect(result.operation).toBe('skip');
    });
});

// ---------------------------------------------------------------------------
// 3. Business membership
// ---------------------------------------------------------------------------

describe('mapLegacyMembershipToBusinessMembership', () => {
    test('accepted membership -> insert with active status and mapped owner role', () => {
        const result = mapLegacyMembershipToBusinessMembership(legacyAcceptedMembershipFixture(), migrationTargetContextFixture());

        expect(result.operation).toBe('insert');
        expect(result.target_table).toBe('business_memberships');
        expect(result.target_payload).toEqual({
            account_id: 'acct-uuid-1',
            business_id: 'biz-uuid-1',
            role: 'owner',
            status: 'active'
        });
    });

    test('non-accepted membership (pending) -> skip with missing_accepted_membership finding, never inferred from matching email/phone', () => {
        // The account and tenant user in these fixtures deliberately share the
        // same normalized email — the mapper must still refuse to link them
        // because the membership itself is not accepted (ADR 0028).
        const account = legacyDgfyAccountFixture();
        const tenantUser = legacyTenantUserFixture();
        expect(account.email.toLowerCase()).toBe(tenantUser.email.toLowerCase());

        const result = mapLegacyMembershipToBusinessMembership(
            legacyMembershipMissingAcceptanceFixture(),
            migrationTargetContextFixture()
        );

        expect(result.operation).toBe('skip');
        expect(result.target_payload).toBeNull();
        expect(result.findings[0].reason_code).toBe(MAPPING_REASON_CODES.MISSING_ACCEPTED_MEMBERSHIP);
    });

    test('declined/removed membership -> skip', () => {
        const declined = mapLegacyMembershipToBusinessMembership(
            legacyAcceptedMembershipFixture({ status: 'declined' }),
            migrationTargetContextFixture()
        );
        const removed = mapLegacyMembershipToBusinessMembership(
            legacyAcceptedMembershipFixture({ status: 'removed' }),
            migrationTargetContextFixture()
        );

        expect(declined.operation).toBe('skip');
        expect(removed.operation).toBe('skip');
    });

    test('maps admin/manager roles to manager, unrecognized roles to member', () => {
        const manager = mapLegacyMembershipToBusinessMembership(
            legacyAcceptedMembershipFixture({ role: 'admin' }),
            migrationTargetContextFixture()
        );
        const member = mapLegacyMembershipToBusinessMembership(
            legacyAcceptedMembershipFixture({ role: 'guest' }),
            migrationTargetContextFixture()
        );

        expect(manager.target_payload.role).toBe('manager');
        expect(member.target_payload.role).toBe('member');
    });
});

// ---------------------------------------------------------------------------
// 4. Staff account
// ---------------------------------------------------------------------------

describe('mapLegacyUserToStaffAccount', () => {
    const bcryptPasswordHash = '$2a$10$tenantlocalhashvalue';
    const bcryptPinHash = '$2b$10$pinhashvalue';

    test('happy path: insert with normalized email, no password/PIN fields in payload', () => {
        const result = mapLegacyUserToStaffAccount(legacyTenantUserFixture(), {
            legacyTenantDbName: 'sku_tenant_1',
            targetBusinessDbName: 'dgfy_business_alpha'
        });

        expect(result.operation).toBe('insert');
        expect(result.target_table).toBe('staff_accounts');
        expect(result.target_database).toBe('dgfy_business_alpha');
        expect(result.target_payload).toEqual({
            display_name: 'janedoe',
            email: 'jane.doe@example.com',
            phone: '+639171234567',
            status: 'active',
            is_master_admin: true
        });
        expect(result.target_payload.password_hash).toBeUndefined();
        expect(result.target_payload.pos_approval_pin_hash).toBeUndefined();
        expect(result.legacy_id_map_key).toEqual({
            legacy_source: 'sku_tenant_1',
            legacy_table: 'users',
            legacy_id: '9001'
        });
    });

    test('exports the pure bcrypt hash classifier used by staff credentials', () => {
        expect(isRealBcryptHash('$2a$10$tenantlocalhashvalue')).toBe(true);
        expect(isRealBcryptHash('$2b$12$tenantlocalhashvalue')).toBe(true);
        expect(isRealBcryptHash('$2x$08$tenantlocalhashvalue')).toBe(true);
        expect(isRealBcryptHash('$2y$10$tenantlocalhashvalue')).toBe(true);
        expect(isRealBcryptHash('PENDING_INVITATION')).toBe(false);
        expect(isRealBcryptHash('$argon2id$v=19$m=4096')).toBe(false);
        expect(isRealBcryptHash(null)).toBe(false);
    });

    test('real bcrypt password_hash emits one staff_credential related target with copied hash and active status', () => {
        const result = mapLegacyUserToStaffAccount(legacyTenantUserFixture({
            password_hash: bcryptPasswordHash,
            pos_approval_pin_hash: null
        }), {
            legacyTenantDbName: 'sku_tenant_1',
            targetBusinessDbName: 'dgfy_business_alpha'
        });

        expect(result.related_targets).toHaveLength(1);
        expect(result.related_targets[0]).toEqual({
            operation: 'insert',
            entity_type: 'staff_credential',
            target_table: 'staff_credentials',
            target_database: 'dgfy_business_alpha',
            target_payload: {
                password_hash: bcryptPasswordHash,
                pos_approval_pin_hash: null,
                credential_status: 'active',
                password_updated_at: null
            }
        });
        expect(result.findings).toEqual([]);
    });

    test('pending-invitation placeholder password creates reset-required credential and reinvite finding', () => {
        const result = mapLegacyUserToStaffAccount(legacyTenantUserFixture({
            password_hash: 'PENDING_INVITATION',
            pos_approval_pin_hash: null
        }), {
            targetBusinessDbName: 'dgfy_business_alpha'
        });

        expect(result.related_targets).toHaveLength(1);
        expect(result.related_targets[0].target_payload).toEqual({
            password_hash: null,
            pos_approval_pin_hash: null,
            credential_status: 'reset_required',
            password_updated_at: null
        });
        expect(result.findings).toHaveLength(1);
        expect(result.findings[0].reason_code).toBe(MAPPING_REASON_CODES.STAFF_CREDENTIAL_RESET_REQUIRED);
        expect(result.findings[0].message).toMatch(/pending legacy invitation/i);
        expect(result.findings[0].remediation).toMatch(/staff_invitations/i);
    });

    test('real bcrypt POS approval PIN is copied even when placeholder password requires reset', () => {
        const result = mapLegacyUserToStaffAccount(legacyTenantUserFixture({
            password_hash: 'PENDING_INVITATION',
            pos_approval_pin_hash: bcryptPinHash
        }), {
            targetBusinessDbName: 'dgfy_business_alpha'
        });

        expect(result.related_targets[0].target_payload).toEqual({
            password_hash: null,
            pos_approval_pin_hash: bcryptPinHash,
            credential_status: 'reset_required',
            password_updated_at: null
        });
        expect(result.findings[0].reason_code).toBe(MAPPING_REASON_CODES.STAFF_CREDENTIAL_RESET_REQUIRED);
    });

    test('staff credential reset findings never include bcrypt hashes in message or remediation', () => {
        const result = mapLegacyUserToStaffAccount(legacyTenantUserFixture({
            password_hash: 'legacy-md5-ish-value',
            pos_approval_pin_hash: '$2y$10$syntheticpinhashvalue'
        }), {
            targetBusinessDbName: 'dgfy_business_alpha'
        });

        const findingText = result.findings
            .flatMap((finding) => [finding.message, finding.remediation])
            .filter(Boolean)
            .join('\n');

        expect(findingText).not.toMatch(/\$2[abxy]\$/);
        expect(findingText).not.toMatch(/legacy-md5-ish-value/);
    });

    test('duplicate email conflict when the email was already seen in this run', () => {
        const seenEmails = new Set(['jane.doe@example.com']);
        const result = mapLegacyUserToStaffAccount(legacyTenantUserDuplicateEmailFixture(), {
            legacyTenantDbName: 'sku_tenant_1',
            targetBusinessDbName: 'dgfy_business_alpha',
            seenEmails
        });

        expect(result.operation).toBe('conflict');
        expect(result.target_payload).toBeNull();
        expect(result.findings[0].reason_code).toBe(MAPPING_REASON_CODES.DUPLICATE_EMAIL);
    });

    test('blank email -> skip', () => {
        const result = mapLegacyUserToStaffAccount(legacyTenantUserFixture({ email: '' }));
        expect(result.operation).toBe('skip');
        expect(result.findings[0].reason_code).toBe(MAPPING_REASON_CODES.MISSING_REQUIRED_FIELD);
    });

    test('falls back to email local-part for display_name when username is blank', () => {
        const result = mapLegacyUserToStaffAccount(legacyTenantUserFixture({ username: '' }));
        expect(result.target_payload.display_name).toBe('jane.doe');
    });

    test('deleted_at present -> removed status', () => {
        const result = mapLegacyUserToStaffAccount(legacyTenantUserFixture({ deleted_at: '2026-07-01T00:00:00.000Z' }));
        expect(result.target_payload.status).toBe('removed');
    });

    test('is_active false -> suspended and staff statuses stay within target enum', () => {
        const inactive = mapLegacyUserToStaffAccount(legacyTenantUserFixture({ is_active: false }));
        const removed = mapLegacyUserToStaffAccount(legacyTenantUserFixture({ deleted_at: '2026-07-01T00:00:00.000Z' }));
        const active = mapLegacyUserToStaffAccount(legacyTenantUserFixture());

        [inactive, removed, active].forEach((result) => {
            expect(['active', 'suspended', 'removed']).toContain(result.target_payload.status);
        });
        expect(inactive.target_payload.status).toBe('suspended');
    });

    test('calling staff mapper twice with same input yields deeply equal output', () => {
        const input = legacyTenantUserFixture({
            password_hash: bcryptPasswordHash,
            pos_approval_pin_hash: bcryptPinHash
        });
        const context = {
            legacyTenantDbName: 'sku_tenant_1',
            targetBusinessDbName: 'dgfy_business_alpha'
        };

        expect(mapLegacyUserToStaffAccount(input, context)).toEqual(mapLegacyUserToStaffAccount(input, context));
    });
});

// ---------------------------------------------------------------------------
// 5. Account-staff assignment
// ---------------------------------------------------------------------------

describe('mapLegacyAccountStaffAssignment', () => {
    test('accepted membership with resolved staff account -> insert', () => {
        const result = mapLegacyAccountStaffAssignment(legacyAcceptedMembershipFixture(), {
            staffAccountId: 'staff-uuid-1',
            targetBusinessDbName: 'dgfy_business_alpha'
        });

        expect(result.operation).toBe('insert');
        expect(result.target_table).toBe('account_staff_assignments');
        expect(result.target_payload).toEqual({
            dgfy_account_id: 'acct-uuid-1',
            staff_account_id: 'staff-uuid-1',
            role: 'owner',
            status: 'active'
        });
    });

    test('non-accepted membership -> skip, never inferred from matching account/user email', () => {
        const account = legacyDgfyAccountFixture();
        const tenantUser = legacyTenantUserFixture();
        expect(account.email.toLowerCase()).toBe(tenantUser.email.toLowerCase());

        const result = mapLegacyAccountStaffAssignment(legacyMembershipMissingAcceptanceFixture(), {
            staffAccountId: 'staff-uuid-1',
            targetBusinessDbName: 'dgfy_business_alpha'
        });

        expect(result.operation).toBe('skip');
        expect(result.target_payload).toBeNull();
        expect(result.findings[0].reason_code).toBe(MAPPING_REASON_CODES.MISSING_ACCEPTED_MEMBERSHIP);
    });

    test('accepted membership with no tenant_user_id -> orphan skip, no email fallback', () => {
        const result = mapLegacyAccountStaffAssignment(legacyMembershipMissingTenantUserLinkFixture(), {
            staffAccountId: 'staff-uuid-1',
            targetBusinessDbName: 'dgfy_business_alpha'
        });

        expect(result.operation).toBe('skip');
        expect(result.findings[0].reason_code).toBe(MAPPING_REASON_CODES.ORPHAN_TENANT_USER_LINK);
        expect(result.findings[0].severity).toBe('orphan');
    });

    test('accepted membership with tenant_user_id but unresolved staff_account_id -> orphan skip', () => {
        const result = mapLegacyAccountStaffAssignment(legacyAcceptedMembershipFixture(), {
            staffAccountId: null,
            targetBusinessDbName: 'dgfy_business_alpha'
        });

        expect(result.operation).toBe('skip');
        expect(result.findings[0].reason_code).toBe(MAPPING_REASON_CODES.ORPHAN_TENANT_USER_LINK);
    });

    test('maps admin role to manager and unrecognized role to staff (distinct enum from business_memberships)', () => {
        const manager = mapLegacyAccountStaffAssignment(
            legacyAcceptedMembershipFixture({ role: 'admin' }),
            { staffAccountId: 'staff-uuid-1' }
        );
        const staff = mapLegacyAccountStaffAssignment(
            legacyAcceptedMembershipFixture({ role: 'cashier' }),
            { staffAccountId: 'staff-uuid-1' }
        );

        expect(manager.target_payload.role).toBe('manager');
        expect(staff.target_payload.role).toBe('staff');
    });
});

// ---------------------------------------------------------------------------
// 6. Location / branch
// ---------------------------------------------------------------------------

describe('mapLegacyLocationToLocation', () => {
    test('happy path: insert with is_primary derived from is_primary_storefront', () => {
        const result = mapLegacyLocationToLocation(legacyTenantLocationFixture(), {
            legacyTenantDbName: 'sku_tenant_1',
            targetBusinessDbName: 'dgfy_business_alpha'
        });

        expect(result.operation).toBe('insert');
        expect(result.target_table).toBe('locations');
        expect(result.target_payload).toEqual({
            name: 'Main Branch',
            address_line: '123 Rizal Street, Cebu City',
            latitude: '10.31672000',
            longitude: '123.89071000',
            is_active: true,
            is_primary: true
        });
        expect(result.legacy_id_map_key).toEqual({
            legacy_source: 'sku_tenant_1',
            legacy_table: 'tenant_locations',
            legacy_id: '701'
        });
    });

    test('missing name -> skip with missing_required_field finding', () => {
        const result = mapLegacyLocationToLocation(legacyTenantLocationMissingNameFixture());
        expect(result.operation).toBe('skip');
        expect(result.findings[0].reason_code).toBe(MAPPING_REASON_CODES.MISSING_REQUIRED_FIELD);
    });

    test('missing address -> skip with missing_required_field finding', () => {
        const result = mapLegacyLocationToLocation(legacyTenantLocationMissingAddressFixture());
        expect(result.operation).toBe('skip');
        expect(result.findings[0].reason_code).toBe(MAPPING_REASON_CODES.MISSING_REQUIRED_FIELD);
    });
});

// ---------------------------------------------------------------------------
// 7. Terminal identity
// ---------------------------------------------------------------------------

describe('mapTerminalRegistryEntryToTerminalIdentity', () => {
    test('happy path: strips secrets, uppercases terminal code, resolves location', () => {
        const result = mapTerminalRegistryEntryToTerminalIdentity(legacyPosTerminalRegistryEntryFixture(), {
            legacyTenantDbName: 'sku_tenant_1',
            targetBusinessDbName: 'dgfy_business_alpha',
            locationId: 'loc-uuid-1'
        });

        expect(result.operation).toBe('insert');
        expect(result.target_table).toBe('terminal_identities');
        expect(result.target_payload).toEqual({
            terminal_code: 'TERMINAL-01',
            label: 'Front Counter',
            location_id: 'loc-uuid-1',
            status: 'active'
        });
        expect(result.findings).toEqual([]);
    });

    test('never includes terminal_password_hash, pairing_version, cashier_email, or is_default in target_payload', () => {
        const result = mapTerminalRegistryEntryToTerminalIdentity(legacyPosTerminalRegistryEntryFixture(), {
            locationId: 'loc-uuid-1'
        });

        const payloadKeys = Object.keys(result.target_payload);
        expect(payloadKeys).toEqual(['terminal_code', 'label', 'location_id', 'status']);
        expect(JSON.stringify(result)).not.toMatch(/terminal_password_hash|pairing_version|cashier_email|is_default/);
    });

    test('invalid terminal_id -> skip with invalid_terminal_id finding', () => {
        const result = mapTerminalRegistryEntryToTerminalIdentity(legacyPosTerminalRegistryEntryInvalidIdFixture());
        expect(result.operation).toBe('skip');
        expect(result.target_payload).toBeNull();
        expect(result.findings[0].reason_code).toBe(MAPPING_REASON_CODES.INVALID_TERMINAL_ID);
    });

    test('unmapped legacy location -> insert proceeds with location_id null plus an orphan finding', () => {
        const result = mapTerminalRegistryEntryToTerminalIdentity(
            legacyPosTerminalRegistryEntryUnmappedLocationFixture(),
            { locationId: null }
        );

        expect(result.operation).toBe('insert');
        expect(result.target_payload.location_id).toBeNull();
        expect(result.findings[0].reason_code).toBe(MAPPING_REASON_CODES.LOCATION_NOT_MAPPED);
        expect(result.findings[0].severity).toBe('orphan');
    });

    test('inactive entry maps to inactive status', () => {
        const result = mapTerminalRegistryEntryToTerminalIdentity(legacyPosTerminalRegistryEntryFixture({ is_active: false }));
        expect(result.target_payload.status).toBe('inactive');
    });
});
