import {
  validateCommercePaymentRefundBody,
  validateCommercePaymentRefundParam,
  validateCommercePaymentRefundRetryBody,
  validateCommercePaymentSessionParam,
  validateCreateDglaundryBookingPaymentSessionBody,
  validateListCommercePaymentSessionsQuery,
  validateListCommercePaymentRefundsQuery,
  validateTenantPayMongoChildAccountActionParam,
  validateTenantPayMongoChildAccountBody,
  validateTenantPaymentAccountBody,
  validateTenantPaymentAccountParam
} from '../src/validators/commercePaymentValidator.js';

const runMiddleware = (middleware, req) => new Promise((resolve) => {
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      resolve({ nextCalled: false, statusCode: this.statusCode, payload });
    }
  };
  middleware(req, res, () => resolve({ nextCalled: true, req }));
});

describe('commerce payment validators', () => {
  it('rejects invalid payment session references', async () => {
    const result = await runMiddleware(validateCommercePaymentSessionParam, {
      params: { payment_session_id: 'bad-reference' }
    });

    expect(result.nextCalled).toBe(false);
    expect(result.statusCode).toBe(422);
  });

  it('accepts comma-delimited known session statuses', async () => {
    const result = await runMiddleware(validateListCommercePaymentSessionsQuery, {
      query: { status: 'paid,refund_pending', limit: '25' }
    });

    expect(result.nextCalled).toBe(true);
    expect(result.req.validatedQuery).toEqual(expect.objectContaining({
      status: 'paid,refund_pending',
      limit: 25
    }));
  });

  it('accepts comma-delimited refund status filters and retry references', async () => {
    const query = await runMiddleware(validateListCommercePaymentSessionsQuery, {
      query: { refund_status: 'failed,manual_review_required,pending' }
    });
    const params = await runMiddleware(validateCommercePaymentRefundParam, {
      params: { payment_session_id: 'CPS-ABC123DEF4', refund_id: 'CRF-ABC123DEF4' }
    });
    const invalidParams = await runMiddleware(validateCommercePaymentRefundParam, {
      params: { payment_session_id: 'CPS-ABC123DEF4', refund_id: 'ref_provider' }
    });

    expect(query.nextCalled).toBe(true);
    expect(query.req.validatedQuery.refund_status).toBe('failed,manual_review_required,pending');
    expect(params.nextCalled).toBe(true);
    expect(invalidParams.nextCalled).toBe(false);
  });

  it('requires exactly one refund amount representation', async () => {
    const result = await runMiddleware(validateCommercePaymentRefundBody, {
      body: { amount: 10, amount_centavos: 1000, refund_strategy: 'proportional' }
    });

    expect(result.nextCalled).toBe(false);
    expect(result.statusCode).toBe(422);
  });

  it.each([undefined, '', '   '])('requires a non-empty refund retry reason (%s)', async (reason) => {
    const result = await runMiddleware(validateCommercePaymentRefundRetryBody, {
      body: reason === undefined ? {} : { reason }
    });

    expect(result.nextCalled).toBe(false);
    expect(result.statusCode).toBe(422);
  });

  it('trims and bounds refund retry reasons while rejecting client-supplied identity keys', async () => {
    const accepted = await runMiddleware(validateCommercePaymentRefundRetryBody, {
      body: { reason: '  Provider confirmed no refund exists  ' }
    });
    const tooLong = await runMiddleware(validateCommercePaymentRefundRetryBody, {
      body: { reason: 'r'.repeat(256) }
    });
    const actor = await runMiddleware(validateCommercePaymentRefundRetryBody, {
      body: { reason: 'Provider confirmed no refund exists', actor: 'spoofed-admin' }
    });
    const requestedBy = await runMiddleware(validateCommercePaymentRefundRetryBody, {
      body: { reason: 'Provider confirmed no refund exists', requested_by: 'spoofed-admin' }
    });

    expect(accepted.nextCalled).toBe(true);
    expect(accepted.req.validatedBody).toEqual({ reason: 'Provider confirmed no refund exists' });
    expect(tooLong.nextCalled).toBe(false);
    expect(tooLong.statusCode).toBe(422);
    expect(actor.nextCalled).toBe(false);
    expect(actor.statusCode).toBe(422);
    expect(requestedBy.nextCalled).toBe(false);
    expect(requestedBy.statusCode).toBe(422);
  });

  it('validates the admin refund list status and pagination query', async () => {
    const accepted = await runMiddleware(validateListCommercePaymentRefundsQuery, {
      query: {
        status: 'failed,manual_review_required',
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        limit: '25',
        offset: '10'
      }
    });
    const invalidStatus = await runMiddleware(validateListCommercePaymentRefundsQuery, {
      query: { status: 'failed,unknown' }
    });
    const invalidTenant = await runMiddleware(validateListCommercePaymentRefundsQuery, {
      query: { tenant_id: 'not-a-uuid' }
    });
    const invalidLimit = await runMiddleware(validateListCommercePaymentRefundsQuery, {
      query: { limit: '251' }
    });

    expect(accepted.nextCalled).toBe(true);
    expect(accepted.req.validatedQuery).toEqual(expect.objectContaining({
      status: 'failed,manual_review_required',
      tenant_id: '550e8400-e29b-41d4-a716-446655440000',
      limit: 25,
      offset: 10
    }));
    expect(invalidStatus.statusCode).toBe(422);
    expect(invalidTenant.statusCode).toBe(422);
    expect(invalidLimit.statusCode).toBe(422);
  });

  it('sanitizes tenant readiness payloads', async () => {
    const result = await runMiddleware(validateTenantPaymentAccountBody, {
      body: {
        provider_merchant_id: ' org_child ',
        wallet_status: 'enabled',
        wallet_verified_at: '2026-05-20',
        onboarding_status: 'active',
        qrph_enabled: true,
        split_enabled: true,
        charges_enabled: true,
        verification_reference: 'PM-SBX-123',
        verified_at: '2026-05-20',
        ignored: 'removed'
      }
    });

    expect(result.nextCalled).toBe(true);
    expect(result.req.validatedBody).not.toHaveProperty('ignored');
    expect(result.req.validatedBody.provider_merchant_id).toBe('org_child');
    expect(result.req.validatedBody.wallet_status).toBe('enabled');
    expect(result.req.validatedBody.verification_reference).toBe('PM-SBX-123');
  });

  it('requires landlord tenant UUIDs for tenant readiness routes', async () => {
    const rejected = await runMiddleware(validateTenantPaymentAccountParam, {
      params: { tenant_id: '10' }
    });
    const accepted = await runMiddleware(validateTenantPaymentAccountParam, {
      params: { tenant_id: '550e8400-e29b-41d4-a716-446655440000' }
    });

    expect(rejected.nextCalled).toBe(false);
    expect(rejected.statusCode).toBe(422);
    expect(accepted.nextCalled).toBe(true);
  });

  it('sanitizes optional PayMongo child account trade names', async () => {
    const result = await runMiddleware(validateTenantPayMongoChildAccountBody, {
      body: {
        trade_name: ' Tenant Trade ',
        ignored: 'removed'
      }
    });

    expect(result.nextCalled).toBe(true);
    expect(result.req.validatedBody).toEqual({ trade_name: 'Tenant Trade' });
  });

  it('only accepts supported PayMongo child account provider actions', async () => {
    const accepted = await runMiddleware(validateTenantPayMongoChildAccountActionParam, {
      params: { tenant_id: '550e8400-e29b-41d4-a716-446655440000', action: 'sync-requirements' }
    });
    const rejected = await runMiddleware(validateTenantPayMongoChildAccountActionParam, {
      params: { tenant_id: '550e8400-e29b-41d4-a716-446655440000', action: 'delete-child' }
    });

    expect(accepted.nextCalled).toBe(true);
    expect(rejected.nextCalled).toBe(false);
    expect(rejected.statusCode).toBe(422);
  });

  it('validates and sanitizes DGLaundry booking payment-session requests', async () => {
    const result = await runMiddleware(validateCreateDglaundryBookingPaymentSessionBody, {
      body: {
        company_id: 'client-supplied-company',
        location_id: 'location-a',
        mode: 'mixed',
        external_order_reference: 'DGL-ORDER-1',
        external_tracking_reference: 'DGL-TRACK-1',
        idempotency_key: 'booking-key-1',
        lines: [
          { mode: 'fixed', variantId: 'fixed-1', quantity: 1, externalLineReference: 'line-fixed', serviceInputs: { stainTreatment: true }, ignored: 'removed' },
          { mode: 'per_kilo', variantId: 'kilo-1', quantity: 1, externalLineReference: 'line-kilo', measurementGrams: 2500 }
        ],
        fulfillment: { mode: 'pickup' },
        customer: { displayName: ' Customer ', email: 'CUSTOMER@EXAMPLE.COM' },
        ignored: 'removed'
      }
    });

    expect(result.nextCalled).toBe(true);
    expect(result.req.validatedBody).not.toHaveProperty('ignored');
    expect(result.req.validatedBody.lines[0]).not.toHaveProperty('ignored');
    expect(result.req.validatedBody.lines[0].serviceInputs).toEqual({ stainTreatment: true });
    expect(result.req.validatedBody.customer).toEqual(expect.objectContaining({ displayName: 'Customer', email: 'customer@example.com' }));
  });

  it('rejects malformed DGLaundry booking payment-session shapes', async () => {
    const result = await runMiddleware(validateCreateDglaundryBookingPaymentSessionBody, {
      body: {
        location_id: 'location-a',
        mode: 'unknown',
        external_order_reference: 'not valid',
        external_tracking_reference: 'track-1',
        idempotency_key: 'bad key',
        lines: [],
        fulfillment: { mode: 'pickup' }
      }
    });

    expect(result.nextCalled).toBe(false);
    expect(result.statusCode).toBe(422);
  });
});
