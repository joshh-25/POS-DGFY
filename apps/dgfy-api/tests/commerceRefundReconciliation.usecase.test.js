import { describe, expect, it, jest } from '@jest/globals';
import { buildReconcilePendingCommerceRefundsUseCase } from '../src/modules/commercePayments/usecases/reconcilePendingCommerceRefundsUseCase.js';
import { buildHandlePayMongoCommerceWebhookUseCase } from '../src/modules/commercePayments/usecases/handlePayMongoCommerceWebhookUseCase.js';

const session = {
  session_id: 31,
  public_reference: 'CPS-ABC123DEF4',
  tenant_id: '550e8400-e29b-41d4-a716-446655440000',
  provider_payment_id: 'pay_1234567890',
  total_amount_centavos: 10000,
  status: 'finalized'
};

const makeRefund = (overrides = {}) => ({
  refund_id: 41,
  public_reference: 'CRF-ABC123DEF4',
  payment_session_id: session.session_id,
  provider_payment_id: session.provider_payment_id,
  amount_centavos: 5000,
  created_at: new Date('2026-10-17T10:00:00Z'),
  status: 'pending',
  ...overrides
});

const buildHarness = (refunds, { providerRefunds = [], now = new Date('2026-10-17T11:00:00Z') } = {}) => {
  const state = new Map(refunds.map((refund) => [refund.refund_id, { ...refund }]));
  const sessionState = { ...session };
  const commercePaymentRepository = {
    listRefundsForReconciliation: jest.fn().mockResolvedValue(refunds),
    findSessionBySessionId: jest.fn().mockImplementation(async () => ({ ...sessionState })),
    runInTransaction: jest.fn().mockImplementation((callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })),
    findRefundById: jest.fn().mockImplementation(async (refundId) => {
      const refund = state.get(refundId);
      return refund ? { ...refund } : null;
    }),
    findRefundByProviderId: jest.fn().mockImplementation(async (providerRefundId) => (
      [...state.values()].find((refund) => refund.provider_refund_id === providerRefundId) || null
    )),
    updateRefundById: jest.fn().mockImplementation(async (refundId, updates) => {
      const next = { ...state.get(refundId), ...updates, updated_at: now };
      state.set(refundId, next);
      return { ...next };
    }),
    updateSessionById: jest.fn().mockImplementation(async (_sessionId, updates) => Object.assign(sessionState, updates)),
    sumRefundCentavosByStatuses: jest.fn().mockImplementation(async (refundId, statuses) => {
      const matching = [...state.values()].filter((refund) => (
        refund.payment_session_id === refundId && statuses.includes(refund.status)
      ));
      return matching.reduce((sum, refund) => sum + Number(refund.amount_centavos || 0), 0);
    }),
    listRefundsBySession: jest.fn().mockImplementation(async () => [...state.values()]),
    createAuditLog: jest.fn().mockResolvedValue(null)
  };
  const paymongoService = {
    retrieveRefund: jest.fn().mockImplementation(async (id) => ({
      id,
      attributes: { status: 'succeeded', amount: 5000 }
    })),
    listPaymentRefunds: jest.fn().mockResolvedValue(providerRefunds)
  };
  return { commercePaymentRepository, paymongoService, state, now };
};

describe('commerce refund reconciliation', () => {
  it('promotes a linked refund through the idempotent status applier', async () => {
    const refund = makeRefund({ provider_refund_id: 'ref_ABC123' });
    const harness = buildHarness([refund]);
    const recordRevenue = jest.fn().mockResolvedValue({ success: true, data: {} });
    const writeLedger = jest.fn().mockResolvedValue({ written: true });
    const updateLedger = jest.fn().mockResolvedValue({ updated: true });
    const useCase = buildReconcilePendingCommerceRefundsUseCase({
      ...harness,
      recordSucceededRevenueRefund: recordRevenue,
      writeOrderPaymentLedgerEntry: writeLedger,
      updateOrderPaymentLedgerEntryStatus: updateLedger,
      now: () => harness.now
    });

    const result = await useCase();

    expect(result).toEqual(expect.objectContaining({ checked: 1, promoted: 1, linked: 0, errors: [] }));
    expect(harness.state.get(refund.refund_id).status).toBe('succeeded');
    expect(writeLedger).toHaveBeenCalledTimes(1);
    expect(updateLedger).toHaveBeenCalledTimes(1);
    expect(recordRevenue).toHaveBeenCalledTimes(1);
  });

  it('does not post a second revenue reversal when the webhook follows reconciler promotion', async () => {
    const refund = makeRefund({ provider_refund_id: 'ref_SHARED' });
    const harness = buildHarness([refund]);
    const recordRevenue = jest.fn().mockResolvedValue({ success: true, data: {} });
    const writeLedger = jest.fn().mockResolvedValue({ written: true });
    const updateLedger = jest.fn().mockResolvedValue({ updated: true });
    await buildReconcilePendingCommerceRefundsUseCase({
      ...harness,
      recordSucceededRevenueRefund: recordRevenue,
      writeOrderPaymentLedgerEntry: writeLedger,
      updateOrderPaymentLedgerEntryStatus: updateLedger,
      now: () => harness.now
    })();

    const webhook = buildHandlePayMongoCommerceWebhookUseCase({
      commercePaymentRepository: harness.commercePaymentRepository,
      paymongoService: { verifyWebhookSignature: jest.fn().mockReturnValue(true) },
      recordSucceededRevenueRefund: recordRevenue,
      logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() }
    });
    const webhookResult = await webhook({
      headers: { 'paymongo-signature': 'valid' },
      rawBody: '{}',
      body: {
        data: {
          id: 'evt_after_reconcile',
          attributes: {
            type: 'payment.refund.updated',
            data: { id: 'ref_SHARED', attributes: { status: 'succeeded' } }
          }
        }
      }
    });

    expect(webhookResult.success).toBe(true);
    expect(webhookResult.data.idempotent_replay).toBe(true);
    expect(recordRevenue).toHaveBeenCalledTimes(1);
    expect(writeLedger).toHaveBeenCalledTimes(1);
    expect(updateLedger).toHaveBeenCalledTimes(1);
  });

  it('alerts on failed provider status and stale pending state', async () => {
    const refund = makeRefund({ provider_refund_id: 'ref_FAILED1' });
    const harness = buildHarness([refund], { now: new Date('2026-10-19T12:00:00Z') });
    harness.paymongoService.retrieveRefund.mockResolvedValueOnce({
      id: 'ref_FAILED1',
      attributes: { status: 'failed', failed_message: 'available payout amount' }
    });
    const raiseAlert = jest.fn().mockResolvedValue(null);
    const useCase = buildReconcilePendingCommerceRefundsUseCase({
      ...harness,
      raiseAlert,
      now: () => harness.now,
      pendingAlertHours: 24
    });

    const result = await useCase();

    expect(result).toEqual(expect.objectContaining({ checked: 1, promoted: 1, stale_alerted: 0 }));
    expect(harness.state.get(refund.refund_id).status).toBe('failed');
    expect(raiseAlert).toHaveBeenCalledWith(expect.objectContaining({
      key: expect.stringContaining('CRF-ABC123DEF4'),
      level: 'error',
      context: expect.objectContaining({ failure_reason: 'available payout amount' })
    }));

    const pendingHarness = buildHarness([makeRefund({
      refund_id: 42,
      public_reference: 'CRF-PENDING001',
      provider_refund_id: 'ref_PENDING1',
      created_at: new Date('2026-10-17T10:00:00Z')
    })], { now: new Date('2026-10-18T12:00:00Z') });
    pendingHarness.paymongoService.retrieveRefund.mockResolvedValueOnce({
      id: 'ref_PENDING1',
      attributes: { status: 'pending', amount: 5000 }
    });
    const pendingAlert = jest.fn().mockResolvedValue(null);
    const pendingUseCase = buildReconcilePendingCommerceRefundsUseCase({
      ...pendingHarness,
      raiseAlert: pendingAlert,
      now: () => pendingHarness.now,
      pendingAlertHours: 24
    });
    const pendingResult = await pendingUseCase();
    expect(pendingResult.stale_alerted).toBe(1);
    expect(pendingAlert).toHaveBeenCalledWith(expect.objectContaining({
      key: expect.stringContaining('CRF-PENDING001'),
      level: 'warning',
      throttleSeconds: 21600
    }));
  });

  it('links exactly one amount-and-time match before applying its status', async () => {
    const refund = makeRefund({
      status: 'created',
      provider_refund_id: null,
      created_at: new Date('2026-10-17T10:00:00Z')
    });
    const providerRefund = {
      id: 'ref_MATCH123',
      attributes: { amount: 5000, created_at: 1792231500, status: 'succeeded' }
    };
    const harness = buildHarness([refund], { providerRefunds: [providerRefund] });
    const useCase = buildReconcilePendingCommerceRefundsUseCase({
      ...harness,
      recordSucceededRevenueRefund: jest.fn().mockResolvedValue({ success: true }),
      now: () => harness.now
    });

    const result = await useCase();

    expect(result).toEqual(expect.objectContaining({ linked: 1, promoted: 1, escalated: 0 }));
    expect(harness.state.get(refund.refund_id)).toEqual(expect.objectContaining({
      provider_refund_id: 'ref_MATCH123',
      status: 'succeeded'
    }));
    expect(harness.commercePaymentRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      changes: expect.objectContaining({ event: 'commerce_payment_refund_provider_linked' })
    }), expect.anything());
  });

  it('escalates missing and ambiguous matches, while leaving a younger unmatched row pending', async () => {
    const older = makeRefund({
      refund_id: 51,
      public_reference: 'CRF-OLDER001',
      status: 'created',
      provider_refund_id: null,
      created_at: new Date('2026-10-17T10:00:00Z')
    });
    const younger = makeRefund({
      refund_id: 52,
      public_reference: 'CRF-YOUNGER1',
      status: 'pending',
      provider_refund_id: null,
      created_at: new Date('2026-10-17T10:20:00Z')
    });
    const harness = buildHarness([older, younger], { now: new Date('2026-10-17T10:35:00Z') });
    const raiseAlert = jest.fn().mockResolvedValue(null);
    const useCase = buildReconcilePendingCommerceRefundsUseCase({
      ...harness,
      raiseAlert,
      now: () => harness.now
    });
    const result = await useCase();
    expect(harness.state.get(older.refund_id)).toEqual(expect.objectContaining({
      status: 'manual_review_required',
      failure_code: 'PROVIDER_REFUND_NOT_FOUND'
    }));
    expect(harness.state.get(younger.refund_id).status).toBe('pending');
    expect(result.escalated).toBe(1);
    expect(raiseAlert).toHaveBeenCalledTimes(1);

    const ambiguous = makeRefund({
      refund_id: 53,
      public_reference: 'CRF-AMBIGUOUS1',
      status: 'pending',
      provider_refund_id: null,
      created_at: new Date('2026-10-17T10:00:00Z')
    });
    const ambiguousHarness = buildHarness([ambiguous], {
      providerRefunds: [
        { id: 'ref_AMBIGUOUS1', attributes: { amount: 5000, created_at: 1792231500, status: 'pending' } },
        { id: 'ref_AMBIGUOUS2', attributes: { amount: 5000, created_at: 1792231600, status: 'pending' } }
      ]
    });
    const ambiguousResult = await buildReconcilePendingCommerceRefundsUseCase({
      ...ambiguousHarness,
      now: () => ambiguousHarness.now
    })();
    expect(ambiguousResult.escalated).toBe(1);
    expect(ambiguousHarness.state.get(ambiguous.refund_id)).toEqual(expect.objectContaining({
      status: 'manual_review_required',
      failure_code: 'PROVIDER_REFUND_AMBIGUOUS_MATCH'
    }));
  });

  it('continues to later refunds after a provider error', async () => {
    const first = makeRefund({
      refund_id: 61,
      public_reference: 'CRF-ERROR001',
      provider_refund_id: 'ref_ERROR1',
      created_at: new Date('2026-10-15T10:00:00Z')
    });
    const second = makeRefund({ refund_id: 62, public_reference: 'CRF-OK0000001', provider_refund_id: 'ref_OK00001' });
    const harness = buildHarness([first, second]);
    harness.paymongoService.retrieveRefund
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockResolvedValueOnce({ id: 'ref_OK00001', attributes: { status: 'succeeded', amount: 5000 } });
    const raiseAlert = jest.fn().mockResolvedValue(null);
    const useCase = buildReconcilePendingCommerceRefundsUseCase({
      ...harness,
      recordSucceededRevenueRefund: jest.fn().mockResolvedValue({ success: true }),
      raiseAlert,
      pendingAlertHours: 24,
      now: () => harness.now
    });

    const result = await useCase();

    expect(result.checked).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.stale_alerted).toBe(1);
    expect(raiseAlert).toHaveBeenCalledWith(expect.objectContaining({ level: 'warning', throttleSeconds: 21600 }));
    expect(harness.state.get(second.refund_id).status).toBe('succeeded');
  });
});
