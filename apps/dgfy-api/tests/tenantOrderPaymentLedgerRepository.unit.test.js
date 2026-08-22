import { describe, expect, it, jest, beforeEach } from '@jest/globals';

// The module reaches the tenant database explicitly (TenantConnector + tenantModelFactory) rather
// than through dbStore, because the PayMongo webhook path has no tenant request context. Both are
// mocked here so these stay pure unit tests with no database.
jest.unstable_mockModule('../src/utils/TenantConnector.js', () => ({
  default: { getConnection: jest.fn().mockResolvedValue({ __fake: 'sequelize' }) }
}));

const getTenantModels = jest.fn();
jest.unstable_mockModule('../src/utils/tenantModelFactory.js', () => ({ getTenantModels }));

const {
  buildForfeitureLedgerIdempotencyKey,
  buildRefundLedgerIdempotencyKey,
  centavosToPeso,
  isDownpaymentSession,
  mapRefundStatusToLedgerStatus,
  updateTenantOrderPaymentEntryStatus,
  writeTenantOrderPaymentEntry
} = await import('../src/modules/commercePayments/repositories/tenantOrderPaymentLedgerRepository.js');

const session = {
  session_id: 77,
  public_reference: 'CPS-ORDER77',
  tenant_id: '550e8400-e29b-41d4-a716-446655440000',
  pos_transaction_id: 903,
  capture_kind: 'downpayment',
  capture_payment_method: 'gcash',
  provider_payment_id: 'pay_ABC123',
  total_amount_centavos: 20000,
  order_total_centavos: 100000,
  downpayment_refundable: false
};

const build = ({ existingEntry = null, downpaymentEntry = { pos_order_payment_id: 41 }, tenant = { tenant_id: session.tenant_id } } = {}) => {
  const PosOrderPayment = {
    findOne: jest.fn(async ({ where }) => (
      where.kind === 'downpayment' ? downpaymentEntry : existingEntry
    )),
    create: jest.fn().mockResolvedValue({ pos_order_payment_id: 99 })
  };
  getTenantModels.mockReturnValue({ PosOrderPayment });
  const commercePaymentRepository = { findTenantById: jest.fn().mockResolvedValue(tenant) };
  return { PosOrderPayment, commercePaymentRepository };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('tenantOrderPaymentLedger — idempotency keys', () => {
  it('uses the landlord refund reference for a refund row', () => {
    expect(buildRefundLedgerIdempotencyKey('CRF-9F2A11')).toBe('CRF-9F2A11');
    expect(buildRefundLedgerIdempotencyKey(null)).toBeNull();
  });

  // The bare session reference is already claimed by Phase 141's kind:'downpayment' row, and
  // (pos_transaction_id, idempotency_key) is UNIQUE — reusing it would collide, not dedupe.
  it('suffixes the session reference for a forfeiture row so it cannot collide with the capture row', () => {
    expect(buildForfeitureLedgerIdempotencyKey('CPS-ORDER77')).toBe('CPS-ORDER77:forfeiture');
    expect(buildForfeitureLedgerIdempotencyKey('')).toBeNull();
  });
});

describe('tenantOrderPaymentLedger — status mapping and conversion', () => {
  it('maps landlord refund statuses onto the tenant ledger enum', () => {
    expect(mapRefundStatusToLedgerStatus('succeeded')).toBe('successful');
    expect(mapRefundStatusToLedgerStatus('refunded')).toBe('successful');
    expect(mapRefundStatusToLedgerStatus('failed')).toBe('failed');
    expect(mapRefundStatusToLedgerStatus('cancelled')).toBe('failed');
    expect(mapRefundStatusToLedgerStatus('created')).toBe('pending');
    expect(mapRefundStatusToLedgerStatus('pending')).toBe('pending');
    // Not terminal — an operator still has to resolve it, so it must not read as failed.
    expect(mapRefundStatusToLedgerStatus('manual_review_required')).toBe('pending');
  });

  // pos_order_payments.amount is peso DECIMAL(14,4) (ADR 0069 clause 4a); the session speaks
  // integer centavos. This is the conversion boundary.
  it('converts centavos to peso at 4dp', () => {
    expect(centavosToPeso(20000)).toBe(200);
    expect(centavosToPeso(12345)).toBe(123.45);
    expect(centavosToPeso(null)).toBe(0);
  });

  it('only recognises a downpayment session that actually created an order', () => {
    expect(isDownpaymentSession(session)).toBe(true);
    expect(isDownpaymentSession({ ...session, capture_kind: 'full' })).toBe(false);
    expect(isDownpaymentSession({ ...session, pos_transaction_id: null })).toBe(false);
  });
});

describe('writeTenantOrderPaymentEntry', () => {
  it('writes a forfeiture row linked back to the original downpayment row', async () => {
    const { PosOrderPayment, commercePaymentRepository } = build();

    const result = await writeTenantOrderPaymentEntry({
      commercePaymentRepository,
      session,
      kind: 'forfeiture',
      status: 'successful',
      amountCentavos: 20000,
      paymentMethod: 'gcash',
      paymentReference: 'pay_ABC123',
      idempotencyKey: 'CPS-ORDER77:forfeiture'
    });

    expect(result).toEqual({ written: true, entryId: 99 });
    expect(PosOrderPayment.create).toHaveBeenCalledWith(expect.objectContaining({
      pos_transaction_id: 903,
      kind: 'forfeiture',
      status: 'successful',
      amount: 200,
      payment_method: 'gcash',
      payment_provider: 'paymongo',
      payment_reference: 'pay_ABC123',
      idempotency_key: 'CPS-ORDER77:forfeiture',
      related_pos_order_payment_id: 41
    }));
    expect(PosOrderPayment.create.mock.calls[0][0].confirmed_at).toBeInstanceOf(Date);
  });

  // A pending refund is recorded as evidence that it was submitted, but is not "confirmed" until
  // the provider webhook says so — that is what the status enum on this table is for.
  it('leaves confirmed_at null for a pending refund row', async () => {
    const { PosOrderPayment, commercePaymentRepository } = build();

    await writeTenantOrderPaymentEntry({
      commercePaymentRepository,
      session,
      kind: 'refund',
      status: 'pending',
      amountCentavos: 20000,
      idempotencyKey: 'CRF-9F2A11'
    });

    expect(PosOrderPayment.create.mock.calls[0][0].confirmed_at).toBeNull();
  });

  // pos_order_payments is the downpayment epic's ledger. A plain full-payment order has never had
  // a capture row in it, so recording a reversal there would make its history incoherent.
  it('skips a full-payment session entirely', async () => {
    const { PosOrderPayment, commercePaymentRepository } = build();

    const result = await writeTenantOrderPaymentEntry({
      commercePaymentRepository,
      session: { ...session, capture_kind: 'full' },
      kind: 'refund',
      status: 'successful',
      amountCentavos: 20000,
      idempotencyKey: 'CRF-9F2A11'
    });

    expect(result).toEqual({ written: false, reason: 'not_a_downpayment_session' });
    expect(commercePaymentRepository.findTenantById).not.toHaveBeenCalled();
    expect(PosOrderPayment.create).not.toHaveBeenCalled();
  });

  // A replayed webhook or a retried cancel is expected here, not exceptional — short-circuit
  // rather than letting the UNIQUE index throw.
  it('short-circuits instead of duplicating when the row already exists', async () => {
    const { PosOrderPayment, commercePaymentRepository } = build({
      existingEntry: { pos_order_payment_id: 66, status: 'pending' }
    });

    const result = await writeTenantOrderPaymentEntry({
      commercePaymentRepository,
      session,
      kind: 'refund',
      status: 'pending',
      amountCentavos: 20000,
      idempotencyKey: 'CRF-9F2A11'
    });

    expect(result).toEqual({ written: false, reason: 'already_recorded', entryId: 66 });
    expect(PosOrderPayment.create).not.toHaveBeenCalled();
  });

  it('still records the reversal when the original downpayment row cannot be found', async () => {
    const { PosOrderPayment, commercePaymentRepository } = build({ downpaymentEntry: null });

    const result = await writeTenantOrderPaymentEntry({
      commercePaymentRepository,
      session,
      kind: 'forfeiture',
      status: 'successful',
      amountCentavos: 20000,
      idempotencyKey: 'CPS-ORDER77:forfeiture'
    });

    expect(result.written).toBe(true);
    expect(PosOrderPayment.create.mock.calls[0][0].related_pos_order_payment_id).toBeNull();
  });

  // Best-effort by contract: the landlord refund row and the order's terminal state are the
  // authoritative records, and losing tenant-side evidence must never fail a money operation that
  // already succeeded (ADR 0052's Architecture Boundaries).
  it('reports rather than throws when the tenant database is unreachable', async () => {
    const { commercePaymentRepository } = build();
    commercePaymentRepository.findTenantById.mockResolvedValue(null);

    const result = await writeTenantOrderPaymentEntry({
      commercePaymentRepository,
      session,
      kind: 'refund',
      status: 'successful',
      amountCentavos: 20000,
      idempotencyKey: 'CRF-9F2A11'
    });

    expect(result).toEqual({ written: false, reason: 'tenant_unreachable' });
  });

  it('reports rather than throws when the insert itself fails', async () => {
    const { PosOrderPayment, commercePaymentRepository } = build();
    PosOrderPayment.create.mockRejectedValue(new Error('ER_LOCK_WAIT_TIMEOUT'));

    const result = await writeTenantOrderPaymentEntry({
      commercePaymentRepository,
      session,
      kind: 'refund',
      status: 'successful',
      amountCentavos: 20000,
      idempotencyKey: 'CRF-9F2A11'
    });

    expect(result).toMatchObject({ written: false, reason: 'write_failed' });
  });
});

describe('updateTenantOrderPaymentEntryStatus', () => {
  const buildEntry = (overrides = {}) => ({
    pos_order_payment_id: 66,
    status: 'pending',
    confirmed_at: null,
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides
  });

  it('promotes a pending refund row to successful and stamps confirmed_at', async () => {
    const entry = buildEntry();
    const { PosOrderPayment, commercePaymentRepository } = build({ existingEntry: entry });
    PosOrderPayment.findOne.mockResolvedValue(entry);

    const result = await updateTenantOrderPaymentEntryStatus({
      commercePaymentRepository,
      session,
      idempotencyKey: 'CRF-9F2A11',
      status: 'successful',
      providerEventId: 'evt_1'
    });

    expect(result).toEqual({ updated: true, entryId: 66 });
    const patch = entry.update.mock.calls[0][0];
    expect(patch.status).toBe('successful');
    expect(patch.confirmed_at).toBeInstanceOf(Date);
    expect(patch.provider_event_id).toBe('evt_1');
  });

  it('is a no-op when the row is already at that status (replayed webhook)', async () => {
    const entry = buildEntry({ status: 'successful' });
    const { PosOrderPayment, commercePaymentRepository } = build({ existingEntry: entry });
    PosOrderPayment.findOne.mockResolvedValue(entry);

    const result = await updateTenantOrderPaymentEntryStatus({
      commercePaymentRepository,
      session,
      idempotencyKey: 'CRF-9F2A11',
      status: 'successful'
    });

    expect(result).toMatchObject({ updated: false, reason: 'already_at_status' });
    expect(entry.update).not.toHaveBeenCalled();
  });

  it('reports rather than throws when no matching row exists', async () => {
    const { PosOrderPayment, commercePaymentRepository } = build();
    PosOrderPayment.findOne.mockResolvedValue(null);

    const result = await updateTenantOrderPaymentEntryStatus({
      commercePaymentRepository,
      session,
      idempotencyKey: 'CRF-MISSING',
      status: 'successful'
    });

    expect(result).toEqual({ updated: false, reason: 'entry_not_found' });
  });

  it('skips a full-payment session', async () => {
    const { commercePaymentRepository } = build();

    const result = await updateTenantOrderPaymentEntryStatus({
      commercePaymentRepository,
      session: { ...session, capture_kind: 'full' },
      idempotencyKey: 'CRF-9F2A11',
      status: 'successful'
    });

    expect(result).toEqual({ updated: false, reason: 'not_a_downpayment_session' });
  });
});
