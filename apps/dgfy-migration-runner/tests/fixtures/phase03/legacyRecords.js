/**
 * Phase 03 Plan 02 (MIG-01, T-03-02-02): reusable legacy-shaped fixtures for
 * `dataMappings.test.js`.
 *
 * Every export is a builder function returning a fresh object per call
 * (never a shared mutable literal), mirroring the `validEntry()` pattern in
 * `targetManifest.test.js`. Positive fixtures mirror the real Sequelize
 * model field shapes read during planning:
 * - backend/src/models/Landlord/DgfyAccount.js
 * - backend/src/models/Landlord/Tenant.js
 * - backend/src/models/Landlord/DgfyAccountTenantMembership.js
 * - backend/src/models/User.js
 * - backend/src/models/TenantLocation.js
 * - backend/src/modules/settings/usecases/posTerminalRegistrySecrets.js (registry entry shape)
 *
 * Negative fixtures exercise the skip/conflict/orphan paths documented in
 * docs/database/dgfy-data-migration-map.md.
 */

// ---------------------------------------------------------------------------
// Migration target manifest context (mirrors targetManifest.js's validated
// entry shape, camelCased for the mapper functions' `target` parameter).
// ---------------------------------------------------------------------------

export function migrationTargetContextFixture(overrides = {}) {
    return {
        targetBusinessDbName: 'dgfy_business_alpha',
        expectedBusinessId: 'biz-uuid-1',
        expectedOwnerAccountId: 'acct-uuid-1',
        ...overrides
    };
}

// ---------------------------------------------------------------------------
// 1. Account identity
// ---------------------------------------------------------------------------

export function legacyDgfyAccountFixture(overrides = {}) {
    return {
        id: 'acct-uuid-1',
        first_name: 'Jane',
        middle_name: null,
        last_name: 'Doe',
        username: 'janedoe',
        email: 'Jane.Doe@Example.com',
        phone: '+639171234567',
        password_hash: '$2b$10$abcdefghijklmnopqrstuv',
        is_active: true,
        email_verified_at: '2026-06-01T00:00:00.000Z',
        phone_verified_at: '2026-06-01T00:00:00.000Z',
        business_step_up_verified_at: null,
        last_login_at: '2026-07-01T00:00:00.000Z',
        provisioning_status: 'self_registered',
        temporary_password_active: false,
        email_verification_source: 'public_otp',
        merchant_terms_acknowledged_at: '2026-06-01T00:00:00.000Z',
        deleted_at: null,
        deleted_by: null,
        deletion_reason: null,
        ...overrides
    };
}

export function legacyDgfyAccountMissingEmailFixture(overrides = {}) {
    return legacyDgfyAccountFixture({ email: '', ...overrides });
}

// ---------------------------------------------------------------------------
// 2. Tenant / business
// ---------------------------------------------------------------------------

export function legacyTenantFixture(overrides = {}) {
    return {
        id: 'tenant-uuid-1',
        name: 'Jane\'s Cafe',
        domain: null,
        subdomain: 'janes-cafe',
        db_name: 'sku_tenant_1',
        company_token: 'company-token-1',
        db_host: 'localhost',
        status: 'active',
        owner_dgfy_account_id: 'acct-uuid-1',
        provisioning_source: 'public_registration',
        ownership_status: 'claimed',
        settings: {},
        plan: 'standard',
        compliance_profile: null,
        ...overrides
    };
}

export function legacyTenantMissingOwnerFixture(overrides = {}) {
    return legacyTenantFixture({ owner_dgfy_account_id: null, ...overrides });
}

export function legacyTenantOwnerMismatchFixture(overrides = {}) {
    return legacyTenantFixture({ owner_dgfy_account_id: 'acct-uuid-999', ...overrides });
}

// ---------------------------------------------------------------------------
// 3 & 5. Business membership / account-staff assignment
// ---------------------------------------------------------------------------

export function legacyAcceptedMembershipFixture(overrides = {}) {
    return {
        id: 501,
        dgfy_account_id: 'acct-uuid-1',
        tenant_id: 'tenant-uuid-1',
        tenant_user_id: 9001,
        role: 'owner',
        status: 'accepted',
        source: 'founder',
        accepted_at: '2026-06-15T00:00:00.000Z',
        last_selected_at: '2026-07-01T00:00:00.000Z',
        ...overrides
    };
}

// Negative fixture: membership not yet accepted (MIG-01 "missing membership"
// case) — even though a matching-email account/user pair exists elsewhere in
// this fixture set, this membership alone must never authorize a link
// (ADR 0028).
export function legacyMembershipMissingAcceptanceFixture(overrides = {}) {
    return legacyAcceptedMembershipFixture({
        id: 502,
        status: 'pending',
        accepted_at: null,
        source: 'invite',
        ...overrides
    });
}

export function legacyMembershipMissingTenantUserLinkFixture(overrides = {}) {
    return legacyAcceptedMembershipFixture({
        id: 503,
        tenant_user_id: null,
        ...overrides
    });
}

// ---------------------------------------------------------------------------
// 4. Staff account
// ---------------------------------------------------------------------------

export function legacyTenantUserFixture(overrides = {}) {
    return {
        user_id: 9001,
        username: 'janedoe',
        email: 'jane.doe@example.com',
        phone_number: '+639171234567',
        password_hash: '$2b$10$tenantlocalhashvalue',
        pos_approval_pin_hash: '$2b$10$pinhashvalue',
        role: 'admin',
        role_preset_key: null,
        is_active: true,
        permissions: [],
        is_master_admin: true,
        last_login: '2026-07-01T00:00:00.000Z',
        deleted_at: null,
        deleted_by: null,
        ...overrides
    };
}

// Duplicate-email negative fixture pair: two distinct tenant users sharing
// an email (staff_accounts.email is unique per docs/database/dgfy-foundation.md).
export function legacyTenantUserDuplicateEmailFixture(overrides = {}) {
    return legacyTenantUserFixture({
        user_id: 9002,
        username: 'janedoe.second',
        is_master_admin: false,
        role: 'staff',
        ...overrides
    });
}

// ---------------------------------------------------------------------------
// 6. Location / branch
// ---------------------------------------------------------------------------

export function legacyTenantLocationFixture(overrides = {}) {
    return {
        location_id: 701,
        name: 'Main Branch',
        address_line: '123 Rizal Street, Cebu City',
        latitude: '10.31672000',
        longitude: '123.89071000',
        delivery_radius_km: '5.00',
        is_open: true,
        is_active: true,
        is_primary_storefront: true,
        operating_hours: null,
        current_wait_time_minutes: 15,
        allow_out_of_stock_sales: false,
        supports_delivery: true,
        supports_pickup: true,
        supports_dine_in: true,
        ...overrides
    };
}

export function legacyTenantLocationMissingNameFixture(overrides = {}) {
    return legacyTenantLocationFixture({ location_id: 702, name: '', ...overrides });
}

export function legacyTenantLocationMissingAddressFixture(overrides = {}) {
    return legacyTenantLocationFixture({ location_id: 703, address_line: '', ...overrides });
}

// ---------------------------------------------------------------------------
// 7. Terminal identity
// ---------------------------------------------------------------------------

export function legacyPosTerminalRegistryEntryFixture(overrides = {}) {
    return {
        terminal_id: 'terminal-01',
        label: 'Front Counter',
        location_id: 701,
        cashier_email: 'cashier@example.com',
        is_active: true,
        is_default: true,
        pairing_version: 'pairing-uuid-1',
        terminal_password_hash: '$2b$10$terminalsecrethashvalue',
        ...overrides
    };
}

export function legacyPosTerminalRegistryEntryInvalidIdFixture(overrides = {}) {
    return legacyPosTerminalRegistryEntryFixture({ terminal_id: '@@@ not-valid @@@', ...overrides });
}

export function legacyPosTerminalRegistryEntryUnmappedLocationFixture(overrides = {}) {
    return legacyPosTerminalRegistryEntryFixture({ terminal_id: 'terminal-02', location_id: 999, ...overrides });
}

// ---------------------------------------------------------------------------
// Out-of-scope fixtures (ADR 0029) — plain shapes representing legacy tables
// this phase never migrates. They are intentionally minimal since no mapper
// function exists (or should exist) for these entities.
// ---------------------------------------------------------------------------

export function legacyExcludedPosTransactionFixture(overrides = {}) {
    return {
        pos_transaction_id: 1,
        terminal_id: 'terminal-01',
        total_amount: '499.00',
        payment_method: 'cash',
        ...overrides
    };
}

export function legacyExcludedProductFixture(overrides = {}) {
    return {
        item_id: 1,
        sku_code: 'SKU-0001',
        category: 'product',
        current_stock: 10,
        ...overrides
    };
}

export function legacyExcludedFiscalReceiptFixture(overrides = {}) {
    return {
        fiscal_receipt_id: 1,
        receipt_number: 'OR-000001',
        ...overrides
    };
}
