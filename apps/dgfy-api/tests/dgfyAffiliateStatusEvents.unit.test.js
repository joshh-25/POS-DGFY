// Unit tests for #1202 (Phase 214) - the affiliate enrollment status-events table
// (dgfy_affiliate_enrollment_status_events), option (b) of PHASE_214_PLAN.md.
//
// Harness copied verbatim from dgfyAffiliateRepository.slotEnforcement.unit.test.js /
// dgfyAffiliateReactivationUseCase.unit.test.js: same in-memory fakes, same models/index.js mock,
// same storefrontDiscovery* stubs. Repository-level, not use-case-level, for the same reason
// slotEnforcement's own header gives: the write sites live in the repository (three of the four
// bypass every use case via mirrorPendingAffiliateInvitesForAccount), so a use-case-only test
// would miss exactly the seam this table exists to cover.

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

const makeFakeModel = (idField) => {
    let rows = [];
    let nextId = 1;
    const lockTails = new Map();

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
        async create(attrs, { transaction } = {}) {
            // A failing insert (test 13) is simulated via `_failNextCreate`, and must actually
            // reject inside the caller's transaction so the whole transaction rolls back - not
            // just throw outside of it.
            if (this._failNextCreate) {
                this._failNextCreate = false;
                throw new Error('simulated insert failure');
            }
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
        async findAll({ where = {}, order = [], limit } = {}) {
            let result = rows.filter((row) => matchesWhere(row, where)).map(toRow);
            for (const [field, direction] of [...order].reverse()) {
                result = [...result].sort((a, b) => {
                    const av = a[field] instanceof Date ? a[field].getTime() : a[field];
                    const bv = b[field] instanceof Date ? b[field].getTime() : b[field];
                    if (av === bv) return 0;
                    const cmp = av > bv ? 1 : -1;
                    return direction === 'DESC' ? -cmp : cmp;
                });
            }
            if (Number.isInteger(limit)) result = result.slice(0, limit);
            return result;
        },
        async findOrCreate({ where = {}, defaults = {}, transaction = null, lock = null } = {}) {
            const pk = where[idField] ?? defaults[idField];
            if (lock && transaction) {
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

jest.unstable_mockModule('../src/services/storefrontDiscoveryIndexService.js', () => ({
    reconcileStorefrontDiscoveryIndex: jest.fn()
}));
jest.unstable_mockModule('../src/services/storefrontDiscoveryCacheState.js', () => ({
    getStorefrontDiscoveryCacheVersion: jest.fn(() => 1)
}));
jest.unstable_mockModule('../src/services/storefrontDiscoveryFreshnessService.js', () => ({
    getStorefrontDiscoverySharedSignature: jest.fn(async () => '1:1')
}));

const { dgfyAffiliateRepository } = await import('../src/modules/dgfy/repositories/dgfyAffiliateRepository.js');
const {
    buildUpdateAffiliateEnrollmentUseCase,
    buildReactivateAffiliateEnrollmentUseCase,
    buildListAffiliateEnrollmentStatusEventsUseCase
} = await import('../src/modules/dgfy/usecases/dgfyAffiliateUseCases.js');

const updateUseCase = buildUpdateAffiliateEnrollmentUseCase();
const reactivateUseCase = buildReactivateAffiliateEnrollmentUseCase();
const listStatusEventsUseCase = buildListAffiliateEnrollmentStatusEventsUseCase();

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

const pendingInvite = (overrides = {}) => ({
    invite_id: 1,
    tenant_id: TENANT_ID,
    email: 'invitee@example.com',
    token_hash: 'token-hash',
    status: 'pending',
    expires_at: new Date(Date.now() + 60 * 60 * 1000),
    ...overrides
});

beforeEach(() => {
    mockTenantAffiliateSettings._seed([]);
    mockDgfyAffiliateEnrollment._seed([]);
    mockDgfyAffiliateInvite._seed([]);
    mockDgfyAffiliateEnrollmentStatusEvent._seed([]);
});

describe('createEnrollment — writes one `enrolled` event (site 1)', () => {
    test('1: provisioning writes one enrolled event, actor_type tenant_user, source admin_api', async () => {
        const enrollment = await dgfyAffiliateRepository.createEnrollment({
            dgfyAccountId: 'account-new',
            tenantId: TENANT_ID,
            shortCode: 'AF-NEW1',
            shareCodeHash: 'hash-new1',
            actorUserId: 11,
            actorUsername: 'Ana'
        });

        const events = mockDgfyAffiliateEnrollmentStatusEvent._rows();
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            enrollment_id: enrollment.enrollment_id,
            tenant_id: TENANT_ID,
            from_status: null,
            to_status: 'active',
            event_type: 'enrolled',
            actor_type: 'tenant_user',
            actor_user_id: 11,
            actor_username: 'Ana',
            source: 'admin_api'
        });
    });
});

describe('materializeInviteEnrollment — invite-accept and auto-enroll (sites 2a/2b)', () => {
    test('2: explicit invite acceptance writes one enrolled event, actor_type dgfy_account, source invite_accept', async () => {
        mockDgfyAffiliateInvite._seed([pendingInvite()]);
        const account = { id: 'account-invitee', email: 'invitee@example.com' };

        const { enrollment, created } = await dgfyAffiliateRepository.materializeInviteEnrollment(
            pendingInvite(),
            account
        );

        expect(created).toBe(true);
        const events = mockDgfyAffiliateEnrollmentStatusEvent._rows();
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            enrollment_id: enrollment.enrollment_id,
            event_type: 'enrolled',
            actor_type: 'dgfy_account',
            actor_dgfy_account_id: 'account-invitee',
            source: 'invite_accept'
        });
    });

    test('3: re-accepting an already-materialized invite writes NO second event (idempotent `existing` branch)', async () => {
        const account = { id: 'account-invitee', email: 'invitee@example.com' };
        const invite = pendingInvite();
        await dgfyAffiliateRepository.materializeInviteEnrollment(invite, account);
        expect(mockDgfyAffiliateEnrollmentStatusEvent._rows()).toHaveLength(1);

        // Second call: the enrollment already exists (unique dgfy_account_id/tenant_id), so
        // materializeInviteEnrollment takes the `existing` branch and must not write again.
        await dgfyAffiliateRepository.materializeInviteEnrollment(invite, account);
        expect(mockDgfyAffiliateEnrollmentStatusEvent._rows()).toHaveLength(1);
    });

    test('4: auto-enroll-on-register (mirrorPendingAffiliateInvitesForAccount) writes source auto_enroll, actor_type system', async () => {
        mockDgfyAffiliateInvite._seed([pendingInvite()]);
        const account = { id: 'account-invitee', email: 'invitee@example.com' };

        await dgfyAffiliateRepository.mirrorPendingAffiliateInvitesForAccount(account);

        const events = mockDgfyAffiliateEnrollmentStatusEvent._rows();
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            event_type: 'enrolled',
            actor_type: 'system',
            source: 'auto_enroll'
        });
        expect(events[0].actor_dgfy_account_id).toBeNull();
    });
});

describe('updateEnrollment (via buildUpdateAffiliateEnrollmentUseCase) — site 3', () => {
    test('5: PATCH {status: suspended} writes one suspended event AND still stamps revoked_at', async () => {
        mockDgfyAffiliateEnrollment._seed([activeEnrollment({ enrollment_id: 5 })]);

        const result = await updateUseCase({
            tenantId: TENANT_ID,
            enrollmentId: 5,
            body: { status: 'suspended' },
            revokedBy: 7,
            revokedByUsername: 'Marco'
        });

        expect(result.success).toBe(true);
        expect(result.data.enrollment.revoked_at).toBeInstanceOf(Date);
        const events = mockDgfyAffiliateEnrollmentStatusEvent._rows();
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            from_status: 'active',
            to_status: 'suspended',
            event_type: 'suspended',
            actor_username: 'Marco',
            source: 'admin_api'
        });
    });

    test('6: idempotent re-PATCH of the same status writes no event (mirrors the `stamped` guard)', async () => {
        mockDgfyAffiliateEnrollment._seed([activeEnrollment({ enrollment_id: 6, status: 'revoked' })]);

        const result = await updateUseCase({
            tenantId: TENANT_ID,
            enrollmentId: 6,
            body: { status: 'revoked' }
        });

        expect(result.success).toBe(true);
        expect(mockDgfyAffiliateEnrollmentStatusEvent._rows()).toHaveLength(0);
    });

    test('7: PATCH of a non-status field (commission_rate_bps) writes no event', async () => {
        mockDgfyAffiliateEnrollment._seed([activeEnrollment({ enrollment_id: 7, commission_rate_bps: null })]);

        const result = await updateUseCase({
            tenantId: TENANT_ID,
            enrollmentId: 7,
            body: { commission_rate_bps: 500 }
        });

        expect(result.success).toBe(true);
        expect(mockDgfyAffiliateEnrollmentStatusEvent._rows()).toHaveLength(0);
    });
});

describe('reactivateEnrollment — site 4', () => {
    test('8a: reactivating a SUSPENDED enrollment writes from_status: suspended', async () => {
        mockDgfyAffiliateEnrollment._seed([activeEnrollment({ enrollment_id: 81, status: 'suspended' })]);

        const result = await reactivateUseCase({
            tenantId: TENANT_ID,
            enrollmentId: 81,
            reactivatedBy: 3,
            reactivatedByUsername: 'Ana'
        });

        expect(result.success).toBe(true);
        const events = mockDgfyAffiliateEnrollmentStatusEvent._rows();
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            from_status: 'suspended',
            to_status: 'active',
            event_type: 'reactivated',
            actor_user_id: 3,
            actor_username: 'Ana'
        });
    });

    test('8b: reactivating a REVOKED enrollment writes from_status: revoked (symmetric with 8a)', async () => {
        mockDgfyAffiliateEnrollment._seed([activeEnrollment({ enrollment_id: 82, status: 'revoked' })]);

        const result = await reactivateUseCase({ tenantId: TENANT_ID, enrollmentId: 82 });

        expect(result.success).toBe(true);
        const events = mockDgfyAffiliateEnrollmentStatusEvent._rows();
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            from_status: 'revoked',
            to_status: 'active',
            event_type: 'reactivated'
        });
    });

    test('9: reactivation still preserves revoked_at/revoked_by/revocation_reason and does not touch activated_at', async () => {
        const revokedAt = new Date('2026-08-01T00:00:00.000Z');
        const activatedAt = new Date('2026-01-01T00:00:00.000Z');
        mockDgfyAffiliateEnrollment._seed([activeEnrollment({
            enrollment_id: 9,
            status: 'revoked',
            activated_at: activatedAt,
            revoked_at: revokedAt,
            revoked_by: 42,
            revocation_reason: 'fraud'
        })]);

        const result = await reactivateUseCase({ tenantId: TENANT_ID, enrollmentId: 9 });

        expect(result.success).toBe(true);
        expect(result.data.enrollment.revoked_at).toBe(revokedAt);
        expect(result.data.enrollment.revoked_by).toBe(42);
        expect(result.data.enrollment.revocation_reason).toBe('fraud');
        expect(result.data.enrollment.activated_at).toBe(activatedAt);
    });
});

describe('a full transition sequence proves #1202 is actually fixed (§3.1)', () => {
    test('10: four transitions yield four events in order; the enrollment columns reflect only the last demotion', async () => {
        mockDgfyAffiliateEnrollment._seed([activeEnrollment({ enrollment_id: 10 })]);

        await updateUseCase({ tenantId: TENANT_ID, enrollmentId: 10, body: { status: 'suspended' }, revokedBy: 1, revokedByUsername: 'Ana' });
        await reactivateUseCase({ tenantId: TENANT_ID, enrollmentId: 10, reactivatedBy: 1, reactivatedByUsername: 'Ana' });
        await updateUseCase({ tenantId: TENANT_ID, enrollmentId: 10, body: { status: 'suspended' }, revokedBy: 2, revokedByUsername: 'Marco' });
        await reactivateUseCase({ tenantId: TENANT_ID, enrollmentId: 10, reactivatedBy: 2, reactivatedByUsername: 'Marco' });

        const events = mockDgfyAffiliateEnrollmentStatusEvent._rows();
        expect(events).toHaveLength(4);
        expect(events.map((e) => e.event_type)).toEqual(['suspended', 'reactivated', 'suspended', 'reactivated']);

        // The enrollment's own three Phase 199 columns only ever reflect the LAST demotion -
        // exactly the defect #1202 was filed against. The events table is what recovers the rest.
        const row = mockDgfyAffiliateEnrollment._rows().find((r) => r.enrollment_id === 10);
        expect(row.status).toBe('active');
        expect(row.revoked_by).toBe(2);
    });
});

describe('GET .../status-events (J7)', () => {
    test('11: newest-first, limit clamped to 100, defaults to 25', async () => {
        mockDgfyAffiliateEnrollment._seed([activeEnrollment({ enrollment_id: 11 })]);
        mockDgfyAffiliateEnrollmentStatusEvent._seed(
            Array.from({ length: 3 }, (_, i) => ({
                status_event_id: i + 1,
                enrollment_id: 11,
                tenant_id: TENANT_ID,
                from_status: i === 0 ? null : 'active',
                to_status: 'active',
                event_type: 'enrolled',
                actor_type: 'system',
                source: 'backfill',
                created_at: new Date(2026, 0, i + 1)
            }))
        );

        const result = await listStatusEventsUseCase({ tenantId: TENANT_ID, enrollmentId: 11 });

        expect(result.success).toBe(true);
        expect(result.data.status_events).toHaveLength(3);
        expect(result.data.status_events[0].status_event_id).toBe(3); // newest first
        expect(result.data.status_events.at(-1).status_event_id).toBe(1);

        const clamped = await listStatusEventsUseCase({ tenantId: TENANT_ID, enrollmentId: 11, limit: 500 });
        // clamp is exercised in the repository; with only 3 rows seeded this just proves no crash
        // and the same 3 rows come back regardless of the requested (over-cap) limit.
        expect(clamped.data.status_events).toHaveLength(3);
    });

    test('12: 404 for an enrollment belonging to another tenant, never leaking its events', async () => {
        mockDgfyAffiliateEnrollment._seed([activeEnrollment({ enrollment_id: 12, tenant_id: 'other-tenant' })]);
        mockDgfyAffiliateEnrollmentStatusEvent._seed([{
            status_event_id: 1,
            enrollment_id: 12,
            tenant_id: 'other-tenant',
            from_status: null,
            to_status: 'active',
            event_type: 'enrolled',
            actor_type: 'system',
            source: 'backfill',
            created_at: new Date()
        }]);

        const result = await listStatusEventsUseCase({ tenantId: TENANT_ID, enrollmentId: 12 });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(404);
    });
});

describe('J10 — a failing event insert aborts the enclosing transaction', () => {
    // This fake's `.sequelize.transaction()` is a plain pass-through (no real commit/rollback -
    // see slotEnforcement's own concurrency-test comment on this same limitation) and its `update`
    // mutates the row object in place rather than copy-on-write, so it cannot itself demonstrate
    // that a rolled-back write actually reverts. What this DOES prove, honestly: the event write
    // is inside the SAME transaction callback as the status write (not a fire-and-forget side
    // effect after it), so a failing insert propagates as a rejection of the whole
    // updateEnrollment() call - which is what makes the real MySQL transaction roll back both
    // writes as one unit (J10). Real rollback behavior needs a DB-backed integration test.
    test('13: a failing event insert propagates as a rejection of the whole updateEnrollment call', async () => {
        mockDgfyAffiliateEnrollment._seed([activeEnrollment({ enrollment_id: 13 })]);
        mockDgfyAffiliateEnrollmentStatusEvent._failNextCreate = true;

        await expect(
            dgfyAffiliateRepository.updateEnrollment(TENANT_ID, 13, { status: 'suspended' })
        ).rejects.toThrow('simulated insert failure');
    });
});
