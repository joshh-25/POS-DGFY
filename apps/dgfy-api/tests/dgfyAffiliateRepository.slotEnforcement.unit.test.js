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
                throw new Error(`Unsupported Op symbol in test fake: ${String(sym)}`);
            });
        }
    }
    return row[key] === expected;
});

// A minimal in-memory stand-in for a Sequelize model, covering only what
// dgfyAffiliateRepository.js's slot-accounting/enrollment/invite methods actually call:
// count, create, findByPk, findOne, and `.sequelize.transaction`.
const makeFakeModel = (idField) => {
    let rows = [];
    let nextId = 1;

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
        sequelize: {
            // Real Sequelize commits/rolls back around the callback's throw/return; the fakes
            // never partially-write before their own throw (the slot check always runs before any
            // create), so a plain pass-through is sufficient here.
            transaction: async (cb) => cb({ LOCK: { UPDATE: 'UPDATE' } })
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

    test('mirrorPendingAffiliateInvitesForAccount (the auto-enroll-on-register hook) propagates the same rejection', async () => {
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

        await expectSlotCapRejection(dgfyAffiliateRepository.mirrorPendingAffiliateInvitesForAccount(account));
        expect(mockDgfyAffiliateEnrollment._rows()).toHaveLength(1);
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
