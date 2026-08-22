// Unit tests for Phase 142 (#823) -- buildListStoreCatalogUseCase exposing the tenant's
// downpayment payment_mode on the public store catalog response, additive to the existing
// payload. This is the seam the storefront reads BEFORE it ever quotes (Simple mode in
// particular never quotes without a discount code today), so it can hide the cash option and
// force a quote up front instead of only discovering the requirement at session-create time.
//
// No database is used -- storeRepository/downpaymentSettingsRepository are hand-built fakes,
// same convention as tests/storeCheckoutDownpaymentResolution.unit.test.js and the pre-existing
// buildListStoreCatalogUseCase coverage in tests/storeUsecases.applicationResult.test.js (this
// file's minimal fixture shape is lifted from there).

import { jest } from '@jest/globals';

const { buildListStoreCatalogUseCase } = await import('../src/modules/store/usecases/storeUseCases.js');
const dbStore = (await import('../src/utils/dbStore.js')).default;

const TENANT_ID = '22222222-2222-4222-8222-222222222222';

const fakeStoreRepository = () => ({
    listStoreCatalog: jest.fn().mockResolvedValue([{
        item_id: 40,
        name: 'Widget',
        current_stock: 100,
        default_sale_price: 500
    }])
});

const fakeDownpaymentSettingsRepository = (settings) => ({
    getSettings: jest.fn().mockResolvedValue(settings)
});

const throwingDownpaymentSettingsRepository = () => ({
    getSettings: jest.fn().mockRejectedValue(new Error('landlord DB unreachable'))
});

const downpaymentRequiredSettings = () => ({
    tenant_id: TENANT_ID,
    payment_mode: 'downpayment_required',
    downpayment_type: 'percentage',
    downpayment_rate_bps: 2000,
    downpayment_fixed_centavos: null,
    min_downpayment_centavos: 0,
    downpayment_refundable: true,
    allowed_capture_methods: null
});

const fullPaymentSettings = () => ({
    tenant_id: TENANT_ID,
    payment_mode: 'full_payment',
    downpayment_type: null,
    downpayment_rate_bps: null,
    downpayment_fixed_centavos: null,
    min_downpayment_centavos: 0,
    downpayment_refundable: true,
    allowed_capture_methods: null
});

const resolveWorkflowCapabilitySettingsFixture = jest.fn().mockResolvedValue({ mode: 'retail', enabledCapabilities: [] });

describe('buildListStoreCatalogUseCase — Phase 142 (#823) tenant payment_mode on the public catalog', () => {
    test('reports downpayment_required when the tenant has downpayment settings configured', async () => {
        const useCase = buildListStoreCatalogUseCase({
            storeRepository: fakeStoreRepository(),
            resolveWorkflowCapabilitySettings: resolveWorkflowCapabilitySettingsFixture,
            downpaymentSettingsRepository: fakeDownpaymentSettingsRepository(downpaymentRequiredSettings())
        });

        const result = await dbStore.run({ tenantId: TENANT_ID, tenantToken: 'dp-store' }, () => (
            useCase({ query: { limit: 20 } })
        ));

        expect(result.success).toBe(true);
        expect(result.data.payment_mode).toBe('downpayment_required');
    });

    test('additive-only: a full_payment tenant reports full_payment and the rest of the payload is unchanged', async () => {
        const useCase = buildListStoreCatalogUseCase({
            storeRepository: fakeStoreRepository(),
            resolveWorkflowCapabilitySettings: resolveWorkflowCapabilitySettingsFixture,
            downpaymentSettingsRepository: fakeDownpaymentSettingsRepository(fullPaymentSettings())
        });

        const result = await dbStore.run({ tenantId: TENANT_ID, tenantToken: 'dp-store' }, () => (
            useCase({ query: { limit: 20 } })
        ));

        expect(result.success).toBe(true);
        expect(result.data.payment_mode).toBe('full_payment');
        expect(result.data).toMatchObject({
            workflow_mode: 'retail',
            enabled_capabilities: []
        });
        expect(Array.isArray(result.data.items)).toBe(true);
        expect(result.data.items).toHaveLength(1);
    });

    test('no downpaymentSettingsRepository injected (every pre-Phase-142 caller) resolves to full_payment, not an error', async () => {
        const useCase = buildListStoreCatalogUseCase({
            storeRepository: fakeStoreRepository(),
            resolveWorkflowCapabilitySettings: resolveWorkflowCapabilitySettingsFixture
        });

        const result = await dbStore.run({ tenantId: TENANT_ID, tenantToken: 'dp-store' }, () => (
            useCase({ query: { limit: 20 } })
        ));

        expect(result.success).toBe(true);
        expect(result.data.payment_mode).toBe('full_payment');
    });

    test('a settings-read failure resolves to full_payment and never fails the catalog request', async () => {
        const useCase = buildListStoreCatalogUseCase({
            storeRepository: fakeStoreRepository(),
            resolveWorkflowCapabilitySettings: resolveWorkflowCapabilitySettingsFixture,
            downpaymentSettingsRepository: throwingDownpaymentSettingsRepository()
        });

        const result = await dbStore.run({ tenantId: TENANT_ID, tenantToken: 'dp-store' }, () => (
            useCase({ query: { limit: 20 } })
        ));

        expect(result.success).toBe(true);
        expect(result.data.payment_mode).toBe('full_payment');
    });

    test('no ambient tenant context resolves to full_payment (matches the existing no-tenant catalog fallback)', async () => {
        const useCase = buildListStoreCatalogUseCase({
            storeRepository: fakeStoreRepository(),
            resolveWorkflowCapabilitySettings: resolveWorkflowCapabilitySettingsFixture,
            downpaymentSettingsRepository: fakeDownpaymentSettingsRepository(downpaymentRequiredSettings())
        });

        const result = await useCase({ query: { limit: 20 } });

        expect(result.success).toBe(true);
        expect(result.data.payment_mode).toBe('full_payment');
    });
});
