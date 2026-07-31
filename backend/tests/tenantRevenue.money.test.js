import { describe, expect, it } from '@jest/globals';
import { tenantRevenueMoney } from '../src/modules/tenantRevenue/usecases/tenantRevenueUseCases.js';

const policy = (overrides = {}) => ({
  dgfy_rate_bps: 200,
  provider_fee_payer: 'tenant',
  shared_fee_tenant_bps: null,
  ...overrides
});

describe('Tenant revenue centavo calculations', () => {
  it('calculates the approved PHP 300 / 2% / PHP 8 example exactly', () => {
    const result = tenantRevenueMoney.calculateTenantRevenueBreakdown({
      grossAmountCentavos: 30000,
      providerFeeCentavos: 800,
      policy: policy()
    });

    expect(result.dgfyFee).toBe(600n);
    expect(result.tenantProviderFee).toBe(800n);
    expect(result.dgfyProviderFee).toBe(0n);
    expect(result.tenantNetPayable).toBe(28600n);
  });

  it('preserves historical 3% policy math without floating point', () => {
    const result = tenantRevenueMoney.calculateTenantRevenueBreakdown({
      grossAmountCentavos: 30000,
      providerFeeCentavos: 800,
      policy: policy({ dgfy_rate_bps: 300 })
    });

    expect(result.dgfyFee).toBe(900n);
    expect(result.tenantNetPayable).toBe(28300n);
  });

  it('supports DGFY-paid provider fees', () => {
    const result = tenantRevenueMoney.calculateTenantRevenueBreakdown({
      grossAmountCentavos: 30000,
      providerFeeCentavos: 800,
      policy: policy({ provider_fee_payer: 'dgfy' })
    });

    expect(result.tenantProviderFee).toBe(0n);
    expect(result.dgfyProviderFee).toBe(800n);
    expect(result.tenantNetPayable).toBe(29400n);
  });

  it('supports exact shared provider fee allocation', () => {
    const result = tenantRevenueMoney.calculateTenantRevenueBreakdown({
      grossAmountCentavos: 30000,
      providerFeeCentavos: 801,
      policy: policy({
        provider_fee_payer: 'shared',
        shared_fee_tenant_bps: 2500
      })
    });

    expect(result.tenantProviderFee).toBe(200n);
    expect(result.dgfyProviderFee).toBe(601n);
    expect(result.tenantProviderFee + result.dgfyProviderFee).toBe(801n);
  });

  it('rounds basis points to the nearest centavo deterministically', () => {
    expect(tenantRevenueMoney.roundBasisPoints(101n, 100)).toBe(1n);
    expect(tenantRevenueMoney.roundBasisPoints(150n, 100)).toBe(2n);
    expect(tenantRevenueMoney.roundBasisPoints(199n, 100)).toBe(2n);
  });

  it('supports zero-percent platform fees', () => {
    const result = tenantRevenueMoney.calculateTenantRevenueBreakdown({
      grossAmountCentavos: 9999,
      providerFeeCentavos: 250,
      policy: policy({ dgfy_rate_bps: 0 })
    });

    expect(result.dgfyFee).toBe(0n);
    expect(result.tenantNetPayable).toBe(9749n);
  });

  it('uses a payment-method-specific percentage and fixed PayMongo fallback', () => {
    const fallbackPolicy = {
      card: { rate_bps: 350, fixed_centavos: 1500 },
      qrph: { rate_bps: 100, fixed_centavos: 0 }
    };

    expect(tenantRevenueMoney.calculateConfiguredProviderFallback({
      grossCentavos: 100000,
      paymentMethod: 'card',
      policy: { fallback_fee_policy: fallbackPolicy }
    })).toBe(5000);
    expect(tenantRevenueMoney.calculateConfiguredProviderFallback({
      grossCentavos: 100000,
      paymentMethod: 'qr_ph',
      policy: { fallback_fee_policy: fallbackPolicy }
    })).toBe(1000);
  });

  it('does not substitute another payment method fallback', () => {
    expect(tenantRevenueMoney.calculateConfiguredProviderFallback({
      grossCentavos: 100000,
      paymentMethod: 'gcash',
      policy: {
        fallback_fee_policy: {
          card: { rate_bps: 350, fixed_centavos: 1500 }
        }
      }
    })).toBeNull();
  });

  it('normalizes supported PayMongo method aliases without combining their fees', () => {
    expect(tenantRevenueMoney.normalizePaymentMethod('credit-card')).toBe('card');
    expect(tenantRevenueMoney.normalizePaymentMethod('GCash')).toBe('ewallet');
    expect(tenantRevenueMoney.normalizePaymentMethod('QR Ph')).toBe('qrph');
    expect(tenantRevenueMoney.normalizePaymentMethod('bank-transfer')).toBe('online_banking');
  });
});
