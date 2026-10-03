import { describe, expect, it } from 'vitest';
import {
    createDefaultTenantRevenuePolicyForm,
    nextPolicyEffectiveDate,
    policyToEditableForm
} from '../tenantRevenuePolicyForm';

describe('Tenant revenue policy form', () => {
    it('hydrates saved basis points and financial policy values for editing', () => {
        const form = policyToEditableForm({
            dgfy_rate_bps: 250,
            settlement_cycle_days: '30',
            settlement_status: 'active',
            minimum_payout_centavos: 12345,
            provider_fee_payer: 'shared',
            shared_fee_tenant_bps: 6250,
            effective_at: '2026-07-31T00:00:00.000Z',
            fallback_fee_policy: {
                qrph: {
                    rate_bps: 175,
                    fixed_centavos: 250
                }
            }
        }, '2026-07-31');

        expect(form).toMatchObject({
            dgfy_percentage: '2.50',
            settlement_cycle_days: '30',
            settlement_status: 'active',
            minimum_payout_pesos: '123.45',
            provider_fee_payer: 'shared',
            shared_fee_percentage: '62.50',
            effective_at: '2026-08-01',
            fallback_method: 'qrph',
            fallback_rate_percentage: '1.75',
            fallback_fixed_pesos: '2.50'
        });
        expect(form.reason).toBe('');
        expect(form.payout_account_number).toBe('');
    });

    it('uses today when it is later than the latest policy effective date', () => {
        expect(nextPolicyEffectiveDate('2026-07-01T00:00:00.000Z', '2026-07-31')).toBe('2026-07-31');
    });

    it('keeps the default form for a tenant without policy history', () => {
        expect(createDefaultTenantRevenuePolicyForm('2026-07-31')).toMatchObject({
            dgfy_percentage: '1.00',
            effective_at: '2026-07-31',
            reason: ''
        });
    });
});
