// Unit tests for max_affiliate_slots enforcement (#1177, Phase 198, per #447 D1-D6) in
// apps/dgfy-api/src/modules/dgfy/repositories/dgfyAffiliateRepository.js.
//
// Deliberately repository-level, not use-case-level: the whole point of #1177 is that
// enforcement must live in the repository, because the registration flow
// (dgfyAuthUseCases.js -> repository.mirrorPendingAffiliateInvitesForAccount ->
// materializeInviteEnrollment) reaches this repository directly, bypassing every use case. A
// use-case-only test would never exercise (or prove closed) that leak. No database is used - the
// four Sequelize models this repository touches for slot accounting are hand-rolled in-memory
// fakes, mirroring the jest.unstable_mockModule pattern in downpaymentSettingsRepository.unit.test.js.

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

const { dgfyAffiliateRepository } = await import('../src/modules/dgfy/repositories/dgfyAffiliateRepository.js');

const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000);
const oneHourAgo = () => new Date(Date.now() - 60 * 60 * 1000);

const activeEnrollment = (overrides = {}) => ({
    dgfy_account_id: 'account-existing',
    tenant_id: TENANT_ID,
    short_code: 'AF-EXIST',
    share_code_hash: 'hash-exist',
    status: 'active',
    source: 'admin_provisioned',
    ...overrides
});

const pendingInvite = (overrides = {}) => ({
    tenant_id: TENANT_ID,
    email: 'invitee@example.com',
    token_hash: 'token-hash',
    status: 'pending',
    expires_at: inOneHour(),
    ...overrides
});

beforeEach(() => {
    mockTenantAffiliateSettings._seed([]);
    mockDgfyAffiliateEnrollment._seed([]);
    mockDgfyAffiliateInvite._seed([]);
});

const expectSlotCapRejection = async (promise) => {
    await expect(promise).rejects.toMatchObject({
        code: 'CONFLICT',
        statusCode: 409,
        details: expect.objectContaining({ reason_code: 'AFFILIATE_SLOT_CAP_REACHED' })
    });
};

describe('getMaxAffiliateSlots', () => {
    test('defaults to 1 when the tenant has no settings row', async () => {
        await expect(dgfyAffiliateRepository.getMaxAffiliateSlots(TENANT_ID)).resolves.toBe(1);
    });

    test('reads the tenant-configured value once a settings row exists', async () => {
        mockTenantAffiliateSettings._seed([{ tenant_id: TENANT_ID, max_affiliate_slots: 3 }]);
        await expect(dgfyAffiliateRepository.getMaxAffiliateSlots(TENANT_ID)).resolves.toBe(3);
    });
});

describe('countConsumedSlots', () => {
    test('counts active enrollments and pending, non-expired invites; excludes everything else (#447 D3/D4)', async () => {
        mockDgfyAffiliateEnrollment._seed([
            activeEnrollment({ dgfy_account_id: 'a1', short_code: 'AF-A1', share_code_hash: 'h1', status: 'active' }),
            activeEnrollment({ dgfy_account_id: 'a2', short_code: 'AF-A2', share_code_hash: 'h2', status: 'revoked' }),
            activeEnrollment({ dgfy_account_id: 'a3', short_code: 'AF-A3', share_code_hash: 'h3', status: 'suspended' })
        ]);
        mockDgfyAffiliateInvite._seed([
            pendingInvite({ email: 'p1@example.com', token_hash: 't1', status: 'pending', expires_at: inOneHour() }),
            pendingInvite({ email: 'p2@example.com', token_hash: 't2', status: 'pending', expires_at: oneHourAgo() }),
            pendingInvite({ email: 'p3@example.com', token_hash: 't3', status: 'cancelled', expires_at: inOneHour() })
        ]);

        await expect(dgfyAffiliateRepository.countConsumedSlots(TENANT_ID)).resolves.toBe(2);
    });
});

describe('createEnrollment — slot cap enforcement', () => {
    test('cap of 1 blocks a second enrollment', async () => {
        mockDgfyAffiliateEnrollment._seed([activeEnrollment()]);

        await expectSlotCapRejection(dgfyAffiliateRepository.createEnrollment({
            dgfyAccountId: 'account-new',
            tenantId: TENANT_ID,
            shortCode: 'AF-NEW1',
            shareCodeHash: 'hash-new1'
        }));
        expect(mockDgfyAffiliateEnrollment._rows()).toHaveLength(1);
    });

    test('a pending invite alone consumes the one slot, blocking a new enrollment', async () => {
        mockDgfyAffiliateInvite._seed([pendingInvite()]);

        await expectSlotCapRejection(dgfyAffiliateRepository.createEnrollment({
            dgfyAccountId: 'account-new',
            tenantId: TENANT_ID,
            shortCode: 'AF-NEW2',
            shareCodeHash: 'hash-new2'
        }));
        expect(mockDgfyAffiliateEnrollment._rows()).toHaveLength(0);
    });

    test('an expired invite does not consume a slot', async () => {
        mockDgfyAffiliateInvite._seed([pendingInvite({ expires_at: oneHourAgo() })]);

        const enrollment = await dgfyAffiliateRepository.createEnrollment({
            dgfyAccountId: 'account-new',
            tenantId: TENANT_ID,
            shortCode: 'AF-NEW3',
            shareCodeHash: 'hash-new3'
        });
        expect(enrollment.short_code).toBe('AF-NEW3');
    });

    test('a cancelled invite does not consume a slot', async () => {
        mockDgfyAffiliateInvite._seed([pendingInvite({ status: 'cancelled' })]);

        const enrollment = await dgfyAffiliateRepository.createEnrollment({
            dgfyAccountId: 'account-new',
            tenantId: TENANT_ID,
            shortCode: 'AF-NEW4',
            shareCodeHash: 'hash-new4'
        });
        expect(enrollment.short_code).toBe('AF-NEW4');
    });

    test('revoking the existing affiliate frees the slot; a new enrollment then succeeds', async () => {
        mockDgfyAffiliateEnrollment._seed([activeEnrollment({ status: 'revoked' })]);

        const enrollment = await dgfyAffiliateRepository.createEnrollment({
            dgfyAccountId: 'account-new',
            tenantId: TENANT_ID,
            shortCode: 'AF-NEW5',
            shareCodeHash: 'hash-new5'
        });
        expect(enrollment.short_code).toBe('AF-NEW5');
    });

    test('raising max_affiliate_slots to 2 permits exactly one additional affiliate', async () => {
        mockTenantAffiliateSettings._seed([{ tenant_id: TENANT_ID, max_affiliate_slots: 2 }]);
        mockDgfyAffiliateEnrollment._seed([activeEnrollment()]);

        const second = await dgfyAffiliateRepository.createEnrollment({
            dgfyAccountId: 'account-second',
            tenantId: TENANT_ID,
            shortCode: 'AF-SECOND',
            shareCodeHash: 'hash-second'
        });
        expect(second.short_code).toBe('AF-SECOND');

        await expectSlotCapRejection(dgfyAffiliateRepository.createEnrollment({
            dgfyAccountId: 'account-third',
            tenantId: TENANT_ID,
            shortCode: 'AF-THIRD',
            shareCodeHash: 'hash-third'
        }));
        expect(mockDgfyAffiliateEnrollment._rows()).toHaveLength(2);
    });
});

describe('createEnrollment — concurrency (#1187 RF-1)', () => {
    test('two concurrent createEnrollment calls for a tenant with NO settings row: only one succeeds at cap 1', async () => {
        // No TenantAffiliateSettings row seeded at all - this is exactly the case RF-1 flagged:
        // assertAffiliateSlotAvailable used to have nothing to lock here, so two concurrent
        // transactions could both read zero consumed slots and both commit past the default cap
        // of 1. The fix locks a `findOrCreate`d settings row instead, so the second caller here
        // must genuinely queue behind the first (see makeFakeModel's findOrCreate/transaction
        // above) rather than racing it.
        //
        // What this proves: given the fake model's lock-queue semantics (a second `findOrCreate`
        // lock request on the same pk awaits the first transaction's full settlement), the fix
        // correctly serializes the two calls and only one enrollment is created. What it does NOT
        // prove: real MySQL `SELECT ... FOR UPDATE` row-lock behavior, real transaction isolation
        // levels, or timing under true OS-level thread/connection concurrency - that requires a
        // DB-backed integration test, which this repository-level unit suite deliberately doesn't
        // run (no database is used here, per the file header).
        const attempt = (suffix) => dgfyAffiliateRepository.createEnrollment({
            dgfyAccountId: `account-${suffix}`,
            tenantId: TENANT_ID,
            shortCode: `AF-RACE${suffix}`,
            shareCodeHash: `hash-race${suffix}`
        });

        const results = await Promise.allSettled([attempt('A'), attempt('B')]);

        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0].reason).toMatchObject({
            code: 'CONFLICT',
            statusCode: 409,
            details: expect.objectContaining({ reason_code: 'AFFILIATE_SLOT_CAP_REACHED' })
        });
        // Exactly one enrollment landed, and the settings row was created exactly once (the
        // second findOrCreate call found the first's row rather than racing to create its own).
        expect(mockDgfyAffiliateEnrollment._rows()).toHaveLength(1);
        expect(mockTenantAffiliateSettings._rows()).toHaveLength(1);
        expect(mockTenantAffiliateSettings._rows()[0].tenant_id).toBe(TENANT_ID);
    });
});

describe('createInvite — slot cap enforcement', () => {
    test('blocks minting a new invite once the tenant is at cap', async () => {
        mockDgfyAffiliateEnrollment._seed([activeEnrollment()]);

        await expectSlotCapRejection(dgfyAffiliateRepository.createInvite({
            tenantId: TENANT_ID,
            email: 'blocked@example.com',
            tokenHash: 'blocked-hash',
            expiresAt: inOneHour()
        }));
        expect(mockDgfyAffiliateInvite._rows()).toHaveLength(0);
    });

    test('succeeds under the cap', async () => {
        const invite = await dgfyAffiliateRepository.createInvite({
            tenantId: TENANT_ID,
            email: 'ok@example.com',
            tokenHash: 'ok-hash',
            expiresAt: inOneHour()
        });
        expect(invite.email).toBe('ok@example.com');
    });

    test('refreshInvite (re-invite/resend of an already-pending invite) does not re-consume', async () => {
        mockDgfyAffiliateInvite._seed([pendingInvite({ invite_id: 1 })]);
        // The invite itself is the tenant's one consumed slot - refreshing it must not trip the
        // cap a second time, since it isn't creating a new row.
        const refreshed = await dgfyAffiliateRepository.refreshInvite(1, {
            tokenHash: 'rotated-hash',
            expiresAt: inOneHour()
        });
        expect(refreshed.token_hash).toBe('rotated-hash');
        expect(refreshed.status).toBe('pending');
    });
});

describe('materializeInviteEnrollment — the registration-mirror path (proof the leak is closed)', () => {
    // This is #1177's core scenario: mirrorPendingAffiliateInvitesForAccount (called from
    // dgfyAuthUseCases.js's register flow, entirely outside any affiliate use case) reaches
    // materializeInviteEnrollment directly. If enforcement only existed in the use-case layer,
    // this path would freely blow past the cap.
    test('blocks materializing a brand-new enrollment when the tenant is already at cap', async () => {
        mockDgfyAffiliateEnrollment._seed([activeEnrollment()]);
        const invite = { invite_id: 1, tenant_id: TENANT_ID, email: 'newcomer@example.com', commission_rate_bps: null };
        mockDgfyAffiliateInvite._seed([{ ...invite, status: 'pending', token_hash: 'newcomer-hash', expires_at: inOneHour() }]);
        const account = { id: 'account-newcomer', email: 'newcomer@example.com' };

        await expectSlotCapRejection(dgfyAffiliateRepository.materializeInviteEnrollment(invite, account));
        expect(mockDgfyAffiliateEnrollment._rows()).toHaveLength(1); // only the pre-seeded one
    });

    test('accepting/materializing a pending invite that is the tenant\'s ONLY consumed slot succeeds (pending -> active is slot-neutral)', async () => {
        // Zero active enrollments; the one pending invite being materialized is itself the
        // tenant's only consumed slot. Converting it to an enrollment must not be counted as
        // consuming a *second* slot against itself - this is the #1177 F1 regression: without
        // excludeInviteId, countConsumedSlots would see this same invite as "1 pending invite"
        // and reject the acceptance of the very invite that's supposedly the blocker.
        const invite = {
            invite_id: 1,
            tenant_id: TENANT_ID,
            email: 'onlyconsumer@example.com',
            commission_rate_bps: null
        };
        mockDgfyAffiliateInvite._seed([{ ...invite, status: 'pending', token_hash: 'only-hash', expires_at: inOneHour() }]);
        const account = { id: 'account-onlyconsumer', email: 'onlyconsumer@example.com' };

        const { enrollment, created } = await dgfyAffiliateRepository.materializeInviteEnrollment(invite, account);
        expect(created).toBe(true);
        expect(enrollment.dgfy_account_id).toBe('account-onlyconsumer');
        expect(mockDgfyAffiliateEnrollment._rows()).toHaveLength(1);
    });

    test('mirrorPendingAffiliateInvitesForAccount (the auto-enroll-on-register hook) does NOT throw when the inviting merchant is at cap - skips the invite and lets registration succeed', async () => {
        // #1177 F2: this runs inside dgfyAuthUseCases.js's account-creation transaction. If it
        // threw here, a brand-new user could never create their DGFY account purely because some
        // unrelated merchant who invited them happens to be at their own affiliate cap right now -
        // a far worse outcome than simply leaving that one invite unmaterialized. The rejection
        // must be caught and turned into a per-invite skip, never propagated.
        mockDgfyAffiliateEnrollment._seed([activeEnrollment()]);
        mockDgfyAffiliateInvite._seed([{
            invite_id: 1,
            tenant_id: TENANT_ID,
            email: 'registrant@example.com',
            status: 'pending',
            token_hash: 'registrant-hash',
            expires_at: inOneHour(),
            commission_rate_bps: null
        }]);
        const account = { id: 'account-registrant', email: 'registrant@example.com' };

        const results = await dgfyAffiliateRepository.mirrorPendingAffiliateInvitesForAccount(account);

        expect(results).toEqual([
            expect.objectContaining({ enrollment: null, created: false, skipped: 'slot_limit_reached', invite_id: 1 })
        ]);
        // No new enrollment was created for the skipped invite - only the pre-seeded blocker.
        expect(mockDgfyAffiliateEnrollment._rows()).toHaveLength(1);
        // The invite is left exactly as it was - still pending, not silently accepted/consumed.
        const inviteRow = mockDgfyAffiliateInvite._rows().find((row) => row.invite_id === 1);
        expect(inviteRow.status).toBe('pending');
    });

    test('mirrorPendingAffiliateInvitesForAccount still propagates a non-slot-cap error from materializeInviteEnrollment', async () => {
        // Only the specific AFFILIATE_SLOT_CAP_REACHED rejection is swallowed - anything else
        // (a genuine failure) must still surface, not be silently absorbed as a "skip".
        mockDgfyAffiliateInvite._seed([{
            invite_id: 1,
            tenant_id: TENANT_ID,
            email: 'registrant@example.com',
            status: 'pending',
            token_hash: 'registrant-hash',
            expires_at: inOneHour(),
            commission_rate_bps: null
        }]);
        const account = { id: 'account-registrant', email: 'registrant@example.com' };
        const unrelatedError = new Error('boom - unrelated infrastructure failure');
        const spy = jest.spyOn(dgfyAffiliateRepository, 'materializeInviteEnrollment').mockRejectedValueOnce(unrelatedError);

        await expect(dgfyAffiliateRepository.mirrorPendingAffiliateInvitesForAccount(account)).rejects.toBe(unrelatedError);

        spy.mockRestore();
    });

    test('opens its own transaction when the caller supplies none (#1187 RF-2 - the explicit accept path)', async () => {
        // buildAcceptAffiliateInviteUseCase calls materializeInviteEnrollment bare (no
        // transaction) - RF-2 flagged that the cap re-check, enrollment insert, and invite-status
        // update therefore never shared a transaction on that path, so the row lock in
        // assertAffiliateSlotAvailable could never actually engage. Confirm the repository now
        // opens one internally rather than relying on the caller to remember to.
        const invite = { invite_id: 1, tenant_id: TENANT_ID, email: 'explicit@example.com', commission_rate_bps: null };
        mockDgfyAffiliateInvite._seed([{ ...invite, status: 'pending', token_hash: 'explicit-hash', expires_at: inOneHour() }]);
        const account = { id: 'account-explicit', email: 'explicit@example.com' };
        const transactionSpy = jest.spyOn(mockDgfyAffiliateEnrollment.sequelize, 'transaction');

        const { enrollment, created } = await dgfyAffiliateRepository.materializeInviteEnrollment(invite, account);

        expect(created).toBe(true);
        expect(enrollment.dgfy_account_id).toBe('account-explicit');
        expect(transactionSpy).toHaveBeenCalledTimes(1);
        transactionSpy.mockRestore();
    });

    test('acquires the settings-row lock BEFORE the `existing`-enrollment lookup, not after (#1187 RF-6)', async () => {
        // #1187 RF-6: materializeInviteEnrollment used to do a plain `existing`-enrollment findOne
        // and only acquire the settings-row lock afterward, inside `if (!existing)`. Under MySQL's
        // default REPEATABLE READ, a transaction's plain reads all share the snapshot established
        // by that transaction's FIRST plain read - so a plain read running before the lock is
        // acquired silently anchors the snapshot too early, and the later plain COUNT queries in
        // countConsumedSlots can still observe a pre-contention world even once the lock is held.
        // The fix: acquireAffiliateSlotLock (the settings-row findOrCreate+lock) must be the very
        // first statement of the transaction, before the `existing` lookup.
        //
        // What this test proves: call ORDER. It spies on the settings-row `findOrCreate` and the
        // enrollment `findOne` and asserts findOrCreate is invoked first.
        //
        // What this test does NOT prove: the actual MVCC/REPEATABLE-READ snapshot behavior this
        // ordering exists to protect against. This suite's fake models (see the file header and
        // makeFakeModel's own comment) hold one mutable, shared row array with no per-transaction
        // snapshot semantics at all - every read, plain or locking, always sees the live, current
        // state of `rows`, regardless of when in the transaction it runs. So a fake-model version of
        // this test with the pre-fix call order would still pass every assertion about final state
        // (consumed counts, rejections) - the fake is structurally incapable of reproducing the
        // stale-snapshot bug RF-6 describes. Proving the actual race requires a DB-backed
        // integration test against real MySQL under REPEATABLE READ, which this repository-level
        // unit suite deliberately doesn't run (no database is used here, per the file header).
        // Asserting call order is the closest this harness can get to guarding the fix's shape.
        const invite = { invite_id: 1, tenant_id: TENANT_ID, email: 'order-check@example.com', commission_rate_bps: null };
        mockDgfyAffiliateInvite._seed([{ ...invite, status: 'pending', token_hash: 'order-check-hash', expires_at: inOneHour() }]);
        const account = { id: 'account-order-check', email: 'order-check@example.com' };

        const callOrder = [];
        const originalFindOrCreate = mockTenantAffiliateSettings.findOrCreate.bind(mockTenantAffiliateSettings);
        const originalFindOne = mockDgfyAffiliateEnrollment.findOne.bind(mockDgfyAffiliateEnrollment);
        const lockSpy = jest.spyOn(mockTenantAffiliateSettings, 'findOrCreate').mockImplementation(async (...args) => {
            callOrder.push('settings-lock');
            return originalFindOrCreate(...args);
        });
        const existingLookupSpy = jest.spyOn(mockDgfyAffiliateEnrollment, 'findOne').mockImplementation(async (...args) => {
            callOrder.push('existing-lookup');
            return originalFindOne(...args);
        });

        const { enrollment, created } = await dgfyAffiliateRepository.materializeInviteEnrollment(invite, account);

        expect(created).toBe(true);
        expect(enrollment.dgfy_account_id).toBe('account-order-check');
        expect(callOrder[0]).toBe('settings-lock');
        expect(callOrder.indexOf('settings-lock')).toBeLessThan(callOrder.indexOf('existing-lookup'));

        lockSpy.mockRestore();
        existingLookupSpy.mockRestore();
    });

    test('the idempotent re-accept branch (invite already accepted) does not re-consume a slot', async () => {
        // The account is already enrolled - materializeInviteEnrollment's `existing` branch fires
        // and never reaches the slot check, even though the tenant is otherwise at cap.
        mockDgfyAffiliateEnrollment._seed([
            activeEnrollment({ dgfy_account_id: 'account-already', short_code: 'AF-ALREADY', share_code_hash: 'hash-already' })
        ]);
        const invite = { invite_id: 1, tenant_id: TENANT_ID, email: 'already@example.com', commission_rate_bps: null };
        mockDgfyAffiliateInvite._seed([{ ...invite, status: 'accepted', token_hash: 'already-hash', expires_at: inOneHour() }]);
        const account = { id: 'account-already', email: 'already@example.com' };

        const { enrollment, created } = await dgfyAffiliateRepository.materializeInviteEnrollment(invite, account);
        expect(created).toBe(false);
        expect(enrollment.dgfy_account_id).toBe('account-already');
        expect(mockDgfyAffiliateEnrollment._rows()).toHaveLength(1);
    });
});
