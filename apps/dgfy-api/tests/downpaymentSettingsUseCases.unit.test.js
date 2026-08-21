// Unit tests for Phase 138 (#820)'s apps/dgfy-api/src/modules/downpayment/usecases/downpaymentSettingsUseCases.js.
//
// No database is used: both use-case builders accept `repository` (and the update builder also
// accepts `resolveWorkflowMode`) as injectable parameters, so an in-memory fake stands in for
// downpaymentSettingsRepository.js -- same pattern as tests/dgfyAffiliatePriceRuleUseCases.unit.test.js.

import { jest } from '@jest/globals';
import {
    buildGetDownpaymentSettingsUseCase,
    buildUpdateDownpaymentSettingsUseCase
} from '../src/modules/downpayment/usecases/downpaymentSettingsUseCases.js';

const TENANT_ID = 'tenant-1';

const DEFAULT_SETTINGS = Object.freeze({
    payment_mode: 'full_payment',
    downpayment_type: null,
    downpayment_rate_bps: null,
    downpayment_fixed_centavos: null,
    min_downpayment_centavos: 0,
    downpayment_refundable: true,
    allowed_capture_methods: null
});

const makeFakeRepository = (seed = {}) => {
    const rows = new Map();
    if (seed.tenant_id) rows.set(seed.tenant_id, { tenant_id: seed.tenant_id, ...DEFAULT_SETTINGS, ...seed });
    return {
        async getSettings(tenantId) {
            const row = rows.get(tenantId);
            if (row) return { ...row };
            return { tenant_id: tenantId, ...DEFAULT_SETTINGS };
        },
        async upsertSettings(tenantId, updates) {
            const current = rows.get(tenantId) || { tenant_id: tenantId, ...DEFAULT_SETTINGS };
            const next = { ...current, ...updates };
            rows.set(tenantId, next);
            return { ...next };
        }
    };
};

describe('buildGetDownpaymentSettingsUseCase', () => {
    test('falls back to defaults when no row exists yet', async () => {
        const useCase = buildGetDownpaymentSettingsUseCase({ repository: makeFakeRepository() });
        const result = await useCase({ tenantId: TENANT_ID });
        expect(result.success).toBe(true);
        expect(result.data.settings).toEqual(expect.objectContaining({ payment_mode: 'full_payment' }));
    });

    test('returns the stored row when one exists', async () => {
        const repository = makeFakeRepository({ tenant_id: TENANT_ID, payment_mode: 'downpayment_required', downpayment_type: 'fixed' });
        const useCase = buildGetDownpaymentSettingsUseCase({ repository });
        const result = await useCase({ tenantId: TENANT_ID });
        expect(result.success).toBe(true);
        expect(result.data.settings.payment_mode).toBe('downpayment_required');
    });

    test('rejects a missing tenant context', async () => {
        const useCase = buildGetDownpaymentSettingsUseCase({ repository: makeFakeRepository() });
        const result = await useCase({ tenantId: '' });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(400);
    });
});

describe('buildUpdateDownpaymentSettingsUseCase', () => {
    test('accepts full_payment without ever resolving workflow_mode', async () => {
        const resolveWorkflowMode = jest.fn();
        const useCase = buildUpdateDownpaymentSettingsUseCase({ repository: makeFakeRepository(), resolveWorkflowMode });
        const result = await useCase({ tenantId: TENANT_ID, body: { payment_mode: 'full_payment' } });
        expect(result.success).toBe(true);
        expect(result.data.settings.payment_mode).toBe('full_payment');
        expect(resolveWorkflowMode).not.toHaveBeenCalled();
    });

    test('rejects an unrecognized payment_mode', async () => {
        const useCase = buildUpdateDownpaymentSettingsUseCase({ repository: makeFakeRepository() });
        const result = await useCase({ tenantId: TENANT_ID, body: { payment_mode: 'not_real' } });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
    });

    // #820's own scope: "Schema customer_choice now; server rejects it as unsupported in v1".
    test('rejects customer_choice as not yet supported', async () => {
        const resolveWorkflowMode = jest.fn();
        const useCase = buildUpdateDownpaymentSettingsUseCase({ repository: makeFakeRepository(), resolveWorkflowMode });
        const result = await useCase({ tenantId: TENANT_ID, body: { payment_mode: 'customer_choice' } });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(result.error.observabilityReasonCode).toBe('PAYMENT_MODE_NOT_SUPPORTED');
        expect(resolveWorkflowMode).not.toHaveBeenCalled();
    });

    // The issue's own named required test: ADR 0069 clause 7 ([binding]) -- a non-Retail
    // workflow_mode store must have downpayment_required rejected, never silently honored.
    test('rejects downpayment_required for a non-Retail workflow_mode', async () => {
        const resolveWorkflowMode = jest.fn().mockResolvedValue('fnb');
        const useCase = buildUpdateDownpaymentSettingsUseCase({ repository: makeFakeRepository(), resolveWorkflowMode });
        const result = await useCase({
            tenantId: TENANT_ID,
            body: {
                payment_mode: 'downpayment_required',
                downpayment_type: 'percentage',
                downpayment_rate_bps: 2000,
                min_downpayment_centavos: 10000
            }
        });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(result.error.observabilityReasonCode).toBe('WORKFLOW_MODE_NOT_RETAIL');
        expect(resolveWorkflowMode).toHaveBeenCalledTimes(1);
    });

    test('accepts downpayment_required for a Retail workflow_mode with a complete payload', async () => {
        const resolveWorkflowMode = jest.fn().mockResolvedValue('retail');
        const useCase = buildUpdateDownpaymentSettingsUseCase({ repository: makeFakeRepository(), resolveWorkflowMode });
        const result = await useCase({
            tenantId: TENANT_ID,
            body: {
                payment_mode: 'downpayment_required',
                downpayment_type: 'percentage',
                downpayment_rate_bps: 2000,
                min_downpayment_centavos: 10000
            }
        });
        expect(result.success).toBe(true);
        expect(result.data.settings).toEqual(expect.objectContaining({
            payment_mode: 'downpayment_required',
            downpayment_type: 'percentage',
            downpayment_rate_bps: 2000
        }));
    });

    test('rejects downpayment_required with no downpayment_type set', async () => {
        const resolveWorkflowMode = jest.fn().mockResolvedValue('retail');
        const useCase = buildUpdateDownpaymentSettingsUseCase({ repository: makeFakeRepository(), resolveWorkflowMode });
        const result = await useCase({ tenantId: TENANT_ID, body: { payment_mode: 'downpayment_required' } });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
    });

    test('rejects downpayment_type percentage with no downpayment_rate_bps', async () => {
        const resolveWorkflowMode = jest.fn().mockResolvedValue('retail');
        const useCase = buildUpdateDownpaymentSettingsUseCase({ repository: makeFakeRepository(), resolveWorkflowMode });
        const result = await useCase({
            tenantId: TENANT_ID,
            body: { payment_mode: 'downpayment_required', downpayment_type: 'percentage', min_downpayment_centavos: 5000 }
        });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
    });

    // #820: min_downpayment_centavos "required -- feeds Phase 140's fee guard".
    test('rejects downpayment_required with min_downpayment_centavos left at 0', async () => {
        const resolveWorkflowMode = jest.fn().mockResolvedValue('retail');
        const useCase = buildUpdateDownpaymentSettingsUseCase({ repository: makeFakeRepository(), resolveWorkflowMode });
        const result = await useCase({
            tenantId: TENANT_ID,
            body: { payment_mode: 'downpayment_required', downpayment_type: 'fixed', downpayment_fixed_centavos: 10000 }
        });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
    });

    test('validates the effective (merged) state across partial updates, not just the current request body', async () => {
        // First request establishes payment_mode + downpayment_type + min_downpayment_centavos but
        // not the rate yet.
        const resolveWorkflowMode = jest.fn().mockResolvedValue('retail');
        const repository = makeFakeRepository({
            tenant_id: TENANT_ID,
            payment_mode: 'downpayment_required',
            downpayment_type: 'percentage',
            downpayment_rate_bps: null,
            min_downpayment_centavos: 10000
        });
        const useCase = buildUpdateDownpaymentSettingsUseCase({ repository, resolveWorkflowMode });

        // A second, unrelated partial update (only touching downpayment_refundable) must still be
        // rejected because the *effective* state (stored downpayment_required + percentage with no
        // rate) is invalid -- not silently accepted just because this request didn't touch those fields.
        const result = await useCase({ tenantId: TENANT_ID, body: { downpayment_refundable: false } });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
    });

    test('rejects allowed_capture_methods that is neither an array nor null', async () => {
        const useCase = buildUpdateDownpaymentSettingsUseCase({ repository: makeFakeRepository() });
        const result = await useCase({ tenantId: TENANT_ID, body: { allowed_capture_methods: 'qrph' } });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
    });

    test('allowed_capture_methods can be explicitly cleared with null', async () => {
        const repository = makeFakeRepository({ tenant_id: TENANT_ID, allowed_capture_methods: ['qrph'] });
        const useCase = buildUpdateDownpaymentSettingsUseCase({ repository });
        const result = await useCase({ tenantId: TENANT_ID, body: { allowed_capture_methods: null } });
        expect(result.success).toBe(true);
        expect(result.data.settings.allowed_capture_methods).toBeNull();
    });
});
