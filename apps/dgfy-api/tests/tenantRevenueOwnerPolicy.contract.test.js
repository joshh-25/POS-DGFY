import { describe, expect, it } from '@jest/globals';
import {
  validateTenantRevenueOwnerFeePolicyBody
} from '../src/validators/tenantRevenueValidator.js';

const runValidator = (body) => {
  const req = { body };
  const res = {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
  let nextCalled = false;
  validateTenantRevenueOwnerFeePolicyBody(req, res, () => {
    nextCalled = true;
  });
  return { req, res, nextCalled };
};

describe('Tenant owner processing-fee policy validation contract', () => {
  it('accepts only the owner-editable fallback policy fields', () => {
    const result = runValidator({
      expected_policy_version: 3,
      fallback_fee_policy: {
        card: { rate_bps: 250, fixed_centavos: 100 },
        ewallet: { rate_bps: 180, fixed_centavos: 0 }
      },
      customer_processing_fee_policy: {
        mode: 'percentage',
        fixed_centavos: 0,
        rate_bps: 300,
        label: 'Processing fee'
      },
      effective_at: '2026-10-01T00:00:00.000Z',
      reason: 'Provider pricing update.'
    });

    expect(result.nextCalled).toBe(true);
    expect(result.req.validatedBody).toMatchObject({ expected_policy_version: 3 });
    expect(result.res.statusCode).toBeNull();
  });

  it('rejects tenant selectors and protected platform settlement fields', () => {
    const result = runValidator({
      tenant_id: 'tenant-selector-must-not-be-accepted',
      expected_policy_version: 3,
      dgfy_rate_bps: 999,
      fallback_fee_policy: { card: { rate_bps: 250, fixed_centavos: 100 } },
      effective_at: '2026-10-01T00:00:00.000Z',
      reason: 'Attempted mass assignment.'
    });

    expect(result.nextCalled).toBe(false);
    expect(result.res.statusCode).toBe(422);
    expect(result.res.payload.errors.map((error) => error.field)).toEqual(
      expect.arrayContaining(['tenant_id', 'dgfy_rate_bps'])
    );
  });

  it('rejects unknown nested fallback fields instead of silently stripping them', () => {
    const result = runValidator({
      expected_policy_version: 3,
      fallback_fee_policy: {
        card: { rate_bps: 250, fixed_centavos: 100, provider_fee_payer: 'dgfy' }
      },
      effective_at: '2026-10-01T00:00:00.000Z',
      reason: 'Nested protected field attempt.'
    });

    expect(result.nextCalled).toBe(false);
    expect(result.res.statusCode).toBe(422);
    expect(result.res.payload.errors.map((error) => error.field)).toContain('fallback_fee_policy.card.provider_fee_payer');
  });
});
