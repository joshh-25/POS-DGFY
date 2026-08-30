// Unit tests for the #1191 (Phase 207) affiliate reactivation endpoint - the ONLY path that may
// perform a `suspended|revoked -> active` transition, with the #1177/Phase 198 slot-cap check.
//
// Harness copied verbatim from dgfyAffiliateRepository.slotEnforcement.unit.test.js (lines 1-171):
// same in-memory fakes, same models/index.js mock, same storefrontDiscovery* stubs. Rather than
// importing only the repository, this file imports the USE-CASE module -
// buildReactivateAffiliateEnrollmentUseCase and buildUpdateAffiliateEnrollmentUseCase both default
// `repository` to the real dgfyAffiliateRepository, which - because models/index.js is mocked
// before the dynamic import below - resolves against the fake models. So this one file covers both
// layers end to end: use-case guards AND repository slot/lock behaviour, including the lock queue
// that makes the concurrency case (test 11) real.

import { jest } from '@jest/globals';
import { Op } from 'sequelize';

const TENANT_ID = 'tenant-1';

const matchesWhere = (row, where = {}) => Object.entries(where).every(([key, expected]) => {
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
        const symbols = Object.getOwnPropertySymbols(expected);
        if (symbols.length) {
            return symbols.every((sym) => {
                if (sym === Op.gt) return new Date(row[key]).getTime() > new Date(expected[sym]).getTime();
                if (sym === Op.in) return expected[sym].includes(row[key]);
                if (sym === Op.ne) return row[key] !== expected[sym];
                throw new Error(`Unsupported Op symbol in test fake: ${String(sym)}`);
            });
        }
    }
    return row[key] === expected;
});

// A minimal in-memory stand-in for a Sequelize model, covering only what
// dgfyAffiliateRepository.js's slot-accounting/enrollment/invite methods actually call:
// count, create, findByPk, findOne, findOrCreate, and `.sequelize.transaction`.
//
// findOrCreate's `lock`+`transaction` combination is given real (if simplistic) mutex semantics,
// not just a pass-through: a second caller requesting the same row's lock genuinely queues behind
// the first until the first's enclosing `sequelize.transaction` callback settles. This is what
// lets the concurrency regression test below actually exercise the #1187 RF-1 serialization fix
// rather than just calling the code path once each with no real interleaving.
const makeFakeModel = (idField) => {
    let rows = [];
    let nextId = 1;
    // pk -> tail of the queue of pending lock holders for that row.
    const lockTails = new Map();

    // Wraps a live row reference (not a copy) so `.update()`/`.reload()` mutate the same object
    // `_rows()`/subsequent finds see - matching real Sequelize instance semantics closely enough
    // for these tests.
    const toRow = (row) => ({
        ...row,
        toJSON: () => ({ ...row }),
        async update(patch) {
            Object.assign(row, patch);
            return this;
        },
        async reload() {
            return toRow(row);
        }
    });

    return {
        _rows: () => rows,
        _seed(newRows = []) {
            rows = newRows.map((row) => ({ ...row }));
            nextId = rows.reduce((max, r) => Math.max(max, Number(r[idField]) || 0), 0) + 1;
        },
        async count({ where = {} } = {}) {
            return rows.filter((row) => matchesWhere(row, where)).length;
        },
        async create(attrs) {
            const row = { [idField]: Number.isInteger(attrs[idField]) ? attrs[idField] : nextId++, ...attrs };
            rows.push(row);
            return toRow(row);
        },
        async findByPk(pk) {
            const row = rows.find((r) => r[idField] === pk);
            return row ? toRow(row) : null;
        },
        async findOne({ where = {} } = {}) {
            const row = rows.find((r) => matchesWhere(r, where));
            return row ? toRow(row) : null;
        },
        async findAll({ where = {} } = {}) {
            return rows.filter((row) => matchesWhere(row, where)).map(toRow);
        },
        async findOrCreate({ where = {}, defaults = {}, transaction = null, lock = null } = {}) {
            const pk = where[idField] ?? defaults[idField];
            if (lock && transaction) {
                // Queue behind whoever currently holds this row's lock, and register this
                // transaction to release it once its own callback settles (see `transaction:`
                // below). A transaction with no other locked row simply waits on an
                // already-resolved tail, so this is a no-op in every existing test.
                const previousTail = lockTails.get(pk) || Promise.resolve();
                let release;
                const held = new Promise((resolve) => { release = resolve; });
                lockTails.set(pk, previousTail.then(() => held));
                transaction._pendingLockReleases = transaction._pendingLockReleases || [];
                transaction._pendingLockReleases.push(release);
                await previousTail;
            }
            const existingRow = rows.find((row) => matchesWhere(row, where));
            if (existingRow) return [toRow(existingRow), false];
            const row = { [idField]: Number.isInteger(defaults[idField]) ? defaults[idField] : nextId++, ...where, ...defaults };
            rows.push(row);
            return [toRow(row), true];
        },
        sequelize: {
            // Real Sequelize commits/rolls back around the callback's throw/return; the fakes
            // never partially-write before their own throw (the slot check always runs before any
            // create), so a plain pass-through is sufficient for every existing test. The
            // `finally` releases any row locks this transaction acquired via `findOrCreate` above,
            // once this callback (commit or rollback) has fully settled - matching how a real
            // row-level lock is held until the transaction ends, not until the individual
            // statement returns.
            transaction: async (cb) => {
                const transaction = { LOCK: { UPDATE: 'UPDATE' } };
                try {
                    return await cb(transaction);
                } finally {
                    (transaction._pendingLockReleases || []).forEach((release) => release());
                }
            }
        }
    };
};

const mockTenantAffiliateSettings = makeFakeModel('tenant_id');
const mockDgfyAffiliateEnrollment = makeFakeModel('enrollment_id');
const mockDgfyAffiliateInvite = makeFakeModel('invite_id');
// #1202 (Phase 214) - the repository now writes one of these per status transition; every
// existing test in this file exercises a write site, so this fake must exist and be seeded even
// though most tests below don't assert on it directly.
const mockDgfyAffiliateEnrollmentStatusEvent = makeFakeModel('status_event_id');

jest.unstable_mockModule('../src/models/index.js', () => ({
    default: {
        DgfyAccount: {},
        DgfyAffiliateAttribution: {},
        DgfyAffiliateEnrollment: mockDgfyAffiliateEnrollment,
        DgfyAffiliateCommission: {},
        DgfyAffiliatePayoutMethod: {},
        DgfyAffiliateCashout: {},
        DgfyAffiliateInvite: mockDgfyAffiliateInvite,
        DgfyAffiliatePriceRule: {},
        DgfyAffiliateCategoryRate: {},
        DgfyAffiliateEnrollmentStatusEvent: mockDgfyAffiliateEnrollmentStatusEvent,
        StorefrontDiscoveryIndex: {},
        Tenant: {},
        TenantAffiliateSettings: mockTenantAffiliateSettings
    },
    DgfyAccount: {},
    DgfyAffiliateAttribution: {},
    DgfyAffiliateEnrollment: mockDgfyAffiliateEnrollment,
    DgfyAffiliateCommission: {},
    DgfyAffiliatePayoutMethod: {},
    DgfyAffiliateCashout: {},
    DgfyAffiliateInvite: mockDgfyAffiliateInvite,
    DgfyAffiliatePriceRule: {},
    DgfyAffiliateCategoryRate: {},
    DgfyAffiliateEnrollmentStatusEvent: mockDgfyAffiliateEnrollmentStatusEvent,
    StorefrontDiscoveryIndex: {},
    Tenant: {},
    TenantAffiliateSettings: mockTenantAffiliateSettings
}));

// dgfyAffiliateRepository.js pulls in resolveTenantByStoreSlug (storefrontTenantResolver.js),
// which has its own models/index.js and service dependencies unrelated to slot enforcement.
// Stub its transitive chain the same way tests/storefrontTenantResolver.test.js does, so mocking
// models/index.js above doesn't break loading it.
jest.unstable_mockModule('../src/services/storefrontDiscoveryIndexService.js', () => ({
    reconcileStorefrontDiscoveryIndex: jest.fn()
}));
jest.unstable_mockModule('../src/services/storefrontDiscoveryCacheState.js', () => ({
    getStorefrontDiscoveryCacheVersion: jest.fn(() => 1)
}));
jest.unstable_mockModule('../src/services/storefrontDiscoveryFreshnessService.js', () => ({
    getStorefrontDiscoverySharedSignature: jest.fn(async () => '1:1')
}));

const {
    buildReactivateAffiliateEnrollmentUseCase,
    buildUpdateAffiliateEnrollmentUseCase
} = await import('../src/modules/dgfy/usecases/dgfyAffiliateUseCases.js');

const reactivateUseCase = buildReactivateAffiliateEnrollmentUseCase();
const updateUseCase = buildUpdateAffiliateEnrollmentUseCase();

const activeEnrollment = (overrides = {}) => ({
    dgfy_account_id: 'account-existing',
    tenant_id: TENANT_ID,
    short_code: 'AF-EXIST',
    share_code_hash: 'hash-exist',
    status: 'active',
    source: 'admin_provisioned',
    activated_at: new Date('2026-01-01T00:00:00.000Z'),
    revoked_at: null,
    revoked_by: null,
    revocation_reason: null,
    ...overrides
});

beforeEach(() => {
    mockTenantAffiliateSettings._seed([]);
    mockDgfyAffiliateEnrollment._seed([]);
    mockDgfyAffiliateInvite._seed([]);
    mockDgfyAffiliateEnrollmentStatusEvent._seed([]);
});

const expectSlotCapRejection = (result) => {
    expect(result.success).toBe(false);
    expect(result.error).toMatchObject({
        code: 'CONFLICT',
        statusCode: 409,
        details: expect.objectContaining({ reason_code: 'AFFILIATE_SLOT_CAP_REACHED' })
    });
};

describe('buildReactivateAffiliateEnrollmentUseCase (#1191 Phase 207)', () => {
    test('1: cap 2, seed 1 active + 1 suspended - reactivating the suspended one succeeds', async () => {
        mockTenantAffiliateSettings._seed([{ tenant_id: TENANT_ID, max_affiliate_slots: 2 }]);
        mockDgfyAffiliateEnrollment._seed([
            activeEnrollment({ enrollment_id: 1, dgfy_account_id: 'a1', short_code: 'AF-A1', share_code_hash: 'h1' }),
            activeEnrollment({ enrollment_id: 2, dgfy_account_id: 'a2', short_code: 'AF-A2', share_code_hash: 'h2', status: 'suspended' })
        ]);

        const result = await reactivateUseCase({ tenantId: TENANT_ID, enrollmentId: 2 });

        expect(result.success).toBe(true);
        expect(result.data.enrollment.status).toBe('active');
        const row = mockDgfyAffiliateEnrollment._rows().find((r) => r.enrollment_id === 2);
        expect(row.status).toBe('active');
    });

    test('2: cap 2, seed 1 active + 1 revoked - reactivating the revoked one succeeds identically to #1', async () => {
        mockTenantAffiliateSettings._seed([{ tenant_id: TENANT_ID, max_affiliate_slots: 2 }]);
        mockDgfyAffiliateEnrollment._seed([
            activeEnrollment({ enrollment_id: 1, dgfy_account_id: 'a1', short_code: 'AF-A1', share_code_hash: 'h1' }),
            activeEnrollment({ enrollment_id: 2, dgfy_account_id: 'a2', short_code: 'AF-A2', share_code_hash: 'h2', status: 'revoked' })
        ]);

        const result = await reactivateUseCase({ tenantId: TENANT_ID, enrollmentId: 2 });

        expect(result.success).toBe(true);
        expect(result.data.enrollment.status).toBe('active');
        const row = mockDgfyAffiliateEnrollment._rows().find((r) => r.enrollment_id === 2);
        expect(row.status).toBe('active');
    });

    test('3: cap 1, seed 1 active + 1 suspended - reactivating the suspended one is rejected, row unchanged', async () => {
        mockTenantAffiliateSettings._seed([{ tenant_id: TENANT_ID, max_affiliate_slots: 1 }]);
        mockDgfyAffiliateEnrollment._seed([
            activeEnrollment({ enrollment_id: 1, dgfy_account_id: 'a1', short_code: 'AF-A1', share_code_hash: 'h1' }),
            activeEnrollment({ enrollment_id: 2, dgfy_account_id: 'a2', short_code: 'AF-A2', share_code_hash: 'h2', status: 'suspended' })
        ]);

        const result = await reactivateUseCase({ tenantId: TENANT_ID, enrollmentId: 2 });

        expectSlotCapRejection(result);
        const row = mockDgfyAffiliateEnrollment._rows().find((r) => r.enrollment_id === 2);
        expect(row.status).toBe('suspended');
    });

    test('4: cap 1 with NO TenantAffiliateSettings row seeded at all (default cap) - same rejection as #3', async () => {
        mockDgfyAffiliateEnrollment._seed([
            activeEnrollment({ enrollment_id: 1, dgfy_account_id: 'a1', short_code: 'AF-A1', share_code_hash: 'h1' }),
            activeEnrollment({ enrollment_id: 2, dgfy_account_id: 'a2', short_code: 'AF-A2', share_code_hash: 'h2', status: 'suspended' })
        ]);

        const result = await reactivateUseCase({ tenantId: TENANT_ID, enrollmentId: 2 });

        expectSlotCapRejection(result);
        const row = mockDgfyAffiliateEnrollment._rows().find((r) => r.enrollment_id === 2);
        expect(row.status).toBe('suspended');
    });

    test('5: reactivating an already-active enrollment is rejected as AFFILIATE_ALREADY_ACTIVE', async () => {
        mockDgfyAffiliateEnrollment._seed([
            activeEnrollment({ enrollment_id: 1, dgfy_account_id: 'a1', short_code: 'AF-A1', share_code_hash: 'h1' })
        ]);

        const result = await reactivateUseCase({ tenantId: TENANT_ID, enrollmentId: 1 });

        expect(result.success).toBe(false);
        expect(result.error).toMatchObject({
            statusCode: 409,
            details: expect.objectContaining({ reason_code: 'AFFILIATE_ALREADY_ACTIVE' })
        });
    });

    test('6: reactivating a pending enrollment is rejected as AFFILIATE_NOT_REACTIVATABLE', async () => {
        mockDgfyAffiliateEnrollment._seed([
            activeEnrollment({ enrollment_id: 1, dgfy_account_id: 'a1', short_code: 'AF-A1', share_code_hash: 'h1', status: 'pending' })
        ]);

        const result = await reactivateUseCase({ tenantId: TENANT_ID, enrollmentId: 1 });

        expect(result.success).toBe(false);
        expect(result.error).toMatchObject({
            statusCode: 409,
            details: expect.objectContaining({ reason_code: 'AFFILIATE_NOT_REACTIVATABLE' })
        });
    });

    test('7: a nonexistent enrollment_id, and an enrollment belonging to a different tenant, both 404', async () => {
        mockDgfyAffiliateEnrollment._seed([
            activeEnrollment({ enrollment_id: 1, tenant_id: 'other-tenant', dgfy_account_id: 'a1', short_code: 'AF-A1', share_code_hash: 'h1', status: 'suspended' })
        ]);

        const missing = await reactivateUseCase({ tenantId: TENANT_ID, enrollmentId: 999 });
        expect(missing.success).toBe(false);
        expect(missing.error.statusCode).toBe(404);

        const wrongTenant = await reactivateUseCase({ tenantId: TENANT_ID, enrollmentId: 1 });
        expect(wrongTenant.success).toBe(false);
        expect(wrongTenant.error.statusCode).toBe(404);
    });

    test('8: a successful reactivate preserves the audit stamp and leaves activated_at untouched (#0.2, #0.3)', async () => {
        const revokedAt = new Date('2026-08-01T00:00:00.000Z');
        const activatedAt = new Date('2026-01-01T00:00:00.000Z');
        mockDgfyAffiliateEnrollment._seed([
            activeEnrollment({
                enrollment_id: 1,
                dgfy_account_id: 'a1',
                short_code: 'AF-A1',
                share_code_hash: 'h1',
                status: 'revoked',
                activated_at: activatedAt,
                revoked_at: revokedAt,
                revoked_by: 42,
                revocation_reason: 'fraud'
            })
        ]);

        const result = await reactivateUseCase({ tenantId: TENANT_ID, enrollmentId: 1 });

        expect(result.success).toBe(true);
        expect(result.data.enrollment.status).toBe('active');
        expect(result.data.enrollment.revoked_at).toBe(revokedAt);
        expect(result.data.enrollment.revoked_by).toBe(42);
        expect(result.data.enrollment.revocation_reason).toBe('fraud');
        expect(result.data.enrollment.activated_at).toBe(activatedAt);
    });

    test('9: buildUpdateAffiliateEnrollmentUseCase with { status: "active" } on a suspended enrollment is rejected (#1191)', async () => {
        mockDgfyAffiliateEnrollment._seed([
            activeEnrollment({ enrollment_id: 1, dgfy_account_id: 'a1', short_code: 'AF-A1', share_code_hash: 'h1', status: 'suspended' })
        ]);

        const result = await updateUseCase({ tenantId: TENANT_ID, enrollmentId: 1, body: { status: 'active' } });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(result.error.message).toMatch(/reactivate/);
        expect(result.error.details).toMatchObject({ reason_code: 'AFFILIATE_REACTIVATION_MOVED' });
        const row = mockDgfyAffiliateEnrollment._rows().find((r) => r.enrollment_id === 1);
        expect(row.status).toBe('suspended');
    });

    test('10: buildUpdateAffiliateEnrollmentUseCase with { status: "suspended" } and { status: "revoked" } both still succeed and stamp', async () => {
        mockDgfyAffiliateEnrollment._seed([
            activeEnrollment({ enrollment_id: 1, dgfy_account_id: 'a1', short_code: 'AF-A1', share_code_hash: 'h1' }),
            activeEnrollment({ enrollment_id: 2, dgfy_account_id: 'a2', short_code: 'AF-A2', share_code_hash: 'h2' })
        ]);

        const suspended = await updateUseCase({ tenantId: TENANT_ID, enrollmentId: 1, body: { status: 'suspended' }, revokedBy: 7 });
        expect(suspended.success).toBe(true);
        expect(suspended.data.enrollment.status).toBe('suspended');
        expect(suspended.data.enrollment.revoked_at).toBeInstanceOf(Date);
        expect(suspended.data.enrollment.revoked_by).toBe(7);

        const revoked = await updateUseCase({ tenantId: TENANT_ID, enrollmentId: 2, body: { status: 'revoked' }, revokedBy: 8 });
        expect(revoked.success).toBe(true);
        expect(revoked.data.enrollment.status).toBe('revoked');
        expect(revoked.data.enrollment.revoked_at).toBeInstanceOf(Date);
        expect(revoked.data.enrollment.revoked_by).toBe(8);
    });

    // Mirrors createEnrollment - concurrency (#1187 RF-1)'s shape and its honest limitations
    // paragraph: this proves serialization given the fake's lock-queue semantics (a second
    // `findOrCreate` lock request on the same pk awaits the first transaction's full settlement),
    // not real MySQL `SELECT ... FOR UPDATE` row-lock behaviour, real transaction isolation
    // levels, or timing under true OS-level thread/connection concurrency - that requires a
    // DB-backed integration test, which this repository-level unit suite deliberately doesn't run.
    test('11: concurrency at the cap boundary - only one of two racing reactivates for different enrollments succeeds', async () => {
        mockTenantAffiliateSettings._seed([{ tenant_id: TENANT_ID, max_affiliate_slots: 2 }]);
        mockDgfyAffiliateEnrollment._seed([
            activeEnrollment({ enrollment_id: 1, dgfy_account_id: 'a1', short_code: 'AF-A1', share_code_hash: 'h1' }),
            activeEnrollment({ enrollment_id: 2, dgfy_account_id: 'a2', short_code: 'AF-A2', share_code_hash: 'h2', status: 'suspended' }),
            activeEnrollment({ enrollment_id: 3, dgfy_account_id: 'a3', short_code: 'AF-A3', share_code_hash: 'h3', status: 'suspended' })
        ]);

        const results = await Promise.allSettled([
            reactivateUseCase({ tenantId: TENANT_ID, enrollmentId: 2 }),
            reactivateUseCase({ tenantId: TENANT_ID, enrollmentId: 3 })
        ]);

        // Both calls go through the use case's own try/catch, so neither promise rejects - the
        // use case returns a `fail()` result instead. Assert on the settled values.
        const fulfilled = results.map((r) => (r.status === 'fulfilled' ? r.value : r.reason));
        const succeeded = fulfilled.filter((r) => r.success === true);
        const failed = fulfilled.filter((r) => r.success === false);

        expect(succeeded).toHaveLength(1);
        expect(failed).toHaveLength(1);
        expect(failed[0].error).toMatchObject({
            code: 'CONFLICT',
            statusCode: 409,
            details: expect.objectContaining({ reason_code: 'AFFILIATE_SLOT_CAP_REACHED' })
        });
        const activeRows = mockDgfyAffiliateEnrollment._rows().filter((r) => r.status === 'active');
        expect(activeRows).toHaveLength(2);
        expect(mockTenantAffiliateSettings._rows()).toHaveLength(1);
    });
});
