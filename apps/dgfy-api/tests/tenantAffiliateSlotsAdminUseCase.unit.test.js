// #1190 (Phase 213): landlord-admin write path for max_affiliate_slots. Mocks tenantAdminRepository
// and dgfyAffiliateRepository directly (no DB required), same pattern as
// updateTenantCapabilitiesUseCase.rollback.test.js and getTenantPosMetadataUseCase's siblings.

import { jest } from '@jest/globals';
import {
    buildGetTenantAffiliateSlotsUseCase,
    buildUpdateTenantAffiliateSlotsUseCase
} from '../src/modules/tenants/usecases/updateTenantAffiliateSlotsUseCase.js';
import { buildUpdateAffiliateSettingsUseCase } from '../src/modules/dgfy/usecases/dgfyAffiliateUseCases.js';

const TENANT_ID = 'tenant-1';

const makeTenantAdminRepository = ({ tenant = { id: TENANT_ID, name: 'Tenant 1' } } = {}) => ({
    findTenantById: jest.fn().mockResolvedValue(tenant),
    createTenantAdminAuditLog: jest.fn().mockResolvedValue(undefined),
    transaction: jest.fn(async (callback) => callback({ id: 'tx' }))
});

const makeDgfyAffiliateRepository = ({ maxAffiliateSlots = 1, slotsUsed = 0, programEnabled = false } = {}) => ({
    acquireAffiliateSlotLock: jest.fn().mockResolvedValue(undefined),
    getSettings: jest.fn().mockResolvedValue({
        tenant_id: TENANT_ID,
        max_affiliate_slots: maxAffiliateSlots,
        program_enabled: programEnabled
    }),
    getMaxAffiliateSlots: jest.fn().mockResolvedValue(maxAffiliateSlots),
    countConsumedSlots: jest.fn().mockResolvedValue(slotsUsed),
    upsertSettings: jest.fn().mockResolvedValue(undefined)
});

describe('updateTenantAffiliateSlotsUseCase (#1190, Phase 213)', () => {
    it('raises the cap, writes the settings row, and writes exactly one audit row', async () => {
        const tenantAdminRepository = makeTenantAdminRepository();
        const dgfyAffiliateRepository = makeDgfyAffiliateRepository({ maxAffiliateSlots: 1, slotsUsed: 0 });
        const useCase = buildUpdateTenantAffiliateSlotsUseCase({ tenantAdminRepository, dgfyAffiliateRepository, logger: { error: jest.fn() } });

        const result = await useCase({
            id: TENANT_ID,
            body: { max_affiliate_slots: 2, reason: 'commercial upgrade approved' },
            actor: { username: 'admin_jp' },
            metadata: { request_id: 'req-1', ip_address: '127.0.0.1', user_agent: 'jest' }
        });

        expect(result.success).toBe(true);
        expect(result.data.max_affiliate_slots).toBe(2);
        expect(result.data.previous_max_affiliate_slots).toBe(1);
        expect(dgfyAffiliateRepository.upsertSettings).toHaveBeenCalledWith(
            TENANT_ID,
            { max_affiliate_slots: 2 },
            { transaction: { id: 'tx' } }
        );
        expect(tenantAdminRepository.createTenantAdminAuditLog).toHaveBeenCalledTimes(1);
        expect(tenantAdminRepository.createTenantAdminAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({
                tenant_id: TENANT_ID,
                action: 'affiliate_slots_update',
                actor_username: 'admin_jp',
                reason: 'commercial upgrade approved',
                before_snapshot: expect.objectContaining({ max_affiliate_slots: 1 })
            }),
            { transaction: { id: 'tx' } }
        );
    });

    it('rejects a missing/short reason with 422 and performs no writes', async () => {
        const tenantAdminRepository = makeTenantAdminRepository();
        const dgfyAffiliateRepository = makeDgfyAffiliateRepository();
        const useCase = buildUpdateTenantAffiliateSlotsUseCase({ tenantAdminRepository, dgfyAffiliateRepository, logger: { error: jest.fn() } });

        const result = await useCase({ id: TENANT_ID, body: { max_affiliate_slots: 2, reason: '  ' }, actor: {} });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(dgfyAffiliateRepository.upsertSettings).not.toHaveBeenCalled();
        expect(tenantAdminRepository.createTenantAdminAuditLog).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown tenant id and performs no writes', async () => {
        const tenantAdminRepository = makeTenantAdminRepository({ tenant: null });
        const dgfyAffiliateRepository = makeDgfyAffiliateRepository();
        const useCase = buildUpdateTenantAffiliateSlotsUseCase({ tenantAdminRepository, dgfyAffiliateRepository, logger: { error: jest.fn() } });

        const result = await useCase({ id: 'missing', body: { max_affiliate_slots: 2, reason: 'valid reason' }, actor: {} });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(404);
        expect(dgfyAffiliateRepository.upsertSettings).not.toHaveBeenCalled();
        expect(tenantAdminRepository.createTenantAdminAuditLog).not.toHaveBeenCalled();
    });

    it("records the observed slots_used in the audit row's before_snapshot", async () => {
        const tenantAdminRepository = makeTenantAdminRepository();
        const dgfyAffiliateRepository = makeDgfyAffiliateRepository({ maxAffiliateSlots: 3, slotsUsed: 2 });
        const useCase = buildUpdateTenantAffiliateSlotsUseCase({ tenantAdminRepository, dgfyAffiliateRepository, logger: { error: jest.fn() } });

        await useCase({ id: TENANT_ID, body: { max_affiliate_slots: 5, reason: 'valid reason here' }, actor: { username: 'admin_jp' } });

        expect(tenantAdminRepository.createTenantAdminAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({
                before_snapshot: { max_affiliate_slots: 3, slots_used: 2 }
            }),
            expect.anything()
        );
    });

    it('audits a no-op write (same value resubmitted)', async () => {
        const tenantAdminRepository = makeTenantAdminRepository();
        const dgfyAffiliateRepository = makeDgfyAffiliateRepository({ maxAffiliateSlots: 2, slotsUsed: 1 });
        const useCase = buildUpdateTenantAffiliateSlotsUseCase({ tenantAdminRepository, dgfyAffiliateRepository, logger: { error: jest.fn() } });

        const result = await useCase({ id: TENANT_ID, body: { max_affiliate_slots: 2, reason: 'confirmed, left as-is' }, actor: { username: 'admin_jp' } });

        expect(result.success).toBe(true);
        expect(dgfyAffiliateRepository.upsertSettings).toHaveBeenCalledTimes(1);
        expect(tenantAdminRepository.createTenantAdminAuditLog).toHaveBeenCalledTimes(1);
    });

    it('calls acquireAffiliateSlotLock before getSettings, passing the same transaction to the lock, getSettings, the write, and the audit insert (A5, RF-1)', async () => {
        const tenantAdminRepository = makeTenantAdminRepository();
        const dgfyAffiliateRepository = makeDgfyAffiliateRepository();
        const callOrder = [];
        dgfyAffiliateRepository.acquireAffiliateSlotLock.mockImplementation(async () => { callOrder.push('lock'); });
        dgfyAffiliateRepository.getSettings.mockImplementation(async () => { callOrder.push('getSettings'); return { max_affiliate_slots: 1 }; });
        const useCase = buildUpdateTenantAffiliateSlotsUseCase({ tenantAdminRepository, dgfyAffiliateRepository, logger: { error: jest.fn() } });

        await useCase({ id: TENANT_ID, body: { max_affiliate_slots: 2, reason: 'valid reason here' }, actor: { username: 'admin_jp' } });

        expect(callOrder).toEqual(['lock', 'getSettings']);
        const tx = { id: 'tx' };
        expect(dgfyAffiliateRepository.acquireAffiliateSlotLock).toHaveBeenCalledWith(TENANT_ID, { transaction: tx });
        // RF-1 (PR #1228 round-1 review): getSettings must read on the same transaction as the
        // lock/write/audit-insert, not an implicit separate connection -- before_snapshot would
        // otherwise not be guaranteed to reflect the locked row.
        expect(dgfyAffiliateRepository.getSettings).toHaveBeenCalledWith(TENANT_ID, { transaction: tx });
        expect(dgfyAffiliateRepository.upsertSettings).toHaveBeenCalledWith(TENANT_ID, { max_affiliate_slots: 2 }, { transaction: tx });
        expect(tenantAdminRepository.createTenantAdminAuditLog).toHaveBeenCalledWith(expect.anything(), { transaction: tx });
    });

    // E2 (Pat, 2026-08-31): lowering below current consumption succeeds and never touches an
    // enrollment or invite -- no enrollment/invite mutation method exists on the mock repository at
    // all, so any attempt to call one would throw "is not a function" and fail this test.
    it('E2: allows lowering the cap below current consumption, grandfathering existing enrollments', async () => {
        const tenantAdminRepository = makeTenantAdminRepository();
        const dgfyAffiliateRepository = makeDgfyAffiliateRepository({ maxAffiliateSlots: 3, slotsUsed: 3 });
        const useCase = buildUpdateTenantAffiliateSlotsUseCase({ tenantAdminRepository, dgfyAffiliateRepository, logger: { error: jest.fn() } });

        const result = await useCase({ id: TENANT_ID, body: { max_affiliate_slots: 1, reason: 'merchant lapsed payment' }, actor: { username: 'admin_jp' } });

        expect(result.success).toBe(true);
        expect(result.data.over_cap).toBe(true);
        expect(result.data.max_affiliate_slots).toBe(1);
        expect(tenantAdminRepository.createTenantAdminAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({ over_cap_after_write: true, slots_used_at_write: 3 })
            }),
            expect.anything()
        );
    });

    // Regression pin for §1.3: the tenant-facing settings use case's per-field allowlist must
    // never grow to include max_affiliate_slots -- that allowlist is the only thing preventing a
    // merchant from self-serve raising its own cap.
    it('regression: buildUpdateAffiliateSettingsUseCase never writes max_affiliate_slots from the tenant-facing body', async () => {
        const repository = {
            getSettings: jest.fn().mockResolvedValue({ tenant_id: TENANT_ID, max_affiliate_slots: 1 }),
            upsertSettings: jest.fn().mockImplementation(async (id, payload) => ({ tenant_id: id, ...payload }))
        };
        const useCase = buildUpdateAffiliateSettingsUseCase({ repository });

        await useCase({ tenantId: TENANT_ID, body: { max_affiliate_slots: 99, program_enabled: true } });

        expect(repository.upsertSettings).toHaveBeenCalledTimes(1);
        const [, updates] = repository.upsertSettings.mock.calls[0];
        expect(updates).not.toHaveProperty('max_affiliate_slots');
    });
});

describe('getTenantAffiliateSlotsUseCase (#1190, Phase 213)', () => {
    it('returns max_affiliate_slots, slots_used, program_enabled, and over_cap without writing anything', async () => {
        const tenantAdminRepository = makeTenantAdminRepository();
        const dgfyAffiliateRepository = makeDgfyAffiliateRepository({ maxAffiliateSlots: 2, slotsUsed: 3, programEnabled: true });
        const useCase = buildGetTenantAffiliateSlotsUseCase({ tenantAdminRepository, dgfyAffiliateRepository, logger: { error: jest.fn() } });

        const result = await useCase({ id: TENANT_ID });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            max_affiliate_slots: 2,
            slots_used: 3,
            program_enabled: true,
            over_cap: true
        }));
        expect(dgfyAffiliateRepository.upsertSettings).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown tenant id', async () => {
        const tenantAdminRepository = makeTenantAdminRepository({ tenant: null });
        const dgfyAffiliateRepository = makeDgfyAffiliateRepository();
        const useCase = buildGetTenantAffiliateSlotsUseCase({ tenantAdminRepository, dgfyAffiliateRepository, logger: { error: jest.fn() } });

        const result = await useCase({ id: 'missing' });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(404);
    });
});
