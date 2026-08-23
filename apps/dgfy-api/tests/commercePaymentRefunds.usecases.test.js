import { jest } from '@jest/globals';
import {
  buildCreateCommercePaymentRefundUseCase
} from '../src/modules/commercePayments/usecases/commercePaymentAdminUseCases.js';
import {
  buildHandlePayMongoCommerceWebhookUseCase
} from '../src/modules/commercePayments/usecases/handlePayMongoCommerceWebhookUseCase.js';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';

const baseSession = {
  session_id: 10,
  public_reference: 'CPS-ABC123DEF4',
  tenant_id: TENANT_ID,
  status: 'finalized',
  finalized_at: new Date('2026-05-19T00:00:00Z'),
  pos_transaction_id: null,
  provider_payment_id: 'pay_test',
  total_amount_centavos: 10000,
  currency: 'PHP'
};

const buildRepository = (overrides = {}) => ({
  findSessionByPublicReference: jest.fn().mockResolvedValue(baseSession),
  findSessionBySessionId: jest.fn().mockResolvedValue(baseSession),
  createRefund: jest.fn().mockImplementation(async (payload) => ({
    refund_id: 20,
    ...payload
  })),
  updateRefundById: jest.fn().mockImplementation(async (refundId, payload) => ({
    refund_id: refundId,
    public_reference: 'CRF-ABC123DEF4',
    payment_session_id: baseSession.session_id,
    ...payload
  })),
  sumRefundedCentavos: jest.fn().mockResolvedValue(0),
  sumRefundCentavosByStatuses: jest.fn()
    .mockResolvedValueOnce(0)
    .mockResolvedValueOnce(5000),
  updateSessionById: jest.fn().mockImplementation(async (sessionId, payload) => ({
    ...baseSession,
    session_id: sessionId,
    ...payload
  })),
  listRefundsBySession: jest.fn().mockResolvedValue([]),
  findRefundByProviderId: jest.fn().mockResolvedValue({
    refund_id: 20,
    public_reference: 'CRF-ABC123DEF4',
    payment_session_id: baseSession.session_id,
    provider_refund_id: 'ref_test',
    amount_centavos: 5000,
    status: 'pending'
  }),
  createAuditLog: jest.fn().mockResolvedValue(null),
  findTenantById: jest.fn().mockResolvedValue(null),
  ...overrides
});

describe('commerce payment refund use-cases', () => {
  it('keeps provider-pending refunds in refund_pending instead of partial_refunded', async () => {
    const commercePaymentRepository = buildRepository();
    const paymongoService = {
      createRefund: jest.fn().mockResolvedValue({
        id: 'ref_pending',
        attributes: { status: 'pending' }
      })
    };
    const useCase = buildCreateCommercePaymentRefundUseCase({ commercePaymentRepository, paymongoService });

    const result = await useCase({
      paymentSessionId: baseSession.public_reference,
      payload: { amount: 50, refund_strategy: 'proportional' },
      actor: 'admin'
    });

    expect(result.success).toBe(true);
    expect(commercePaymentRepository.updateRefundById).toHaveBeenCalledWith(20, expect.objectContaining({
      status: 'pending',
      provider_refund_id: 'ref_pending'
    }));
    expect(commercePaymentRepository.updateSessionById).toHaveBeenCalledWith(baseSession.session_id, {
      status: 'refund_pending'
    });
  });

  it('keeps an ambiguous provider failure pending for reconciliation instead of retrying blindly', async () => {
    const commercePaymentRepository = buildRepository({
      sumRefundCentavosByStatuses: jest.fn()
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(5000)
    });
    const paymongoService = {
      createRefund: jest.fn().mockRejectedValue(new Error('socket timeout'))
    };
    const useCase = buildCreateCommercePaymentRefundUseCase({ commercePaymentRepository, paymongoService });

    const result = await useCase({
      paymentSessionId: baseSession.public_reference,
      payload: { amount_centavos: 5000, refund_strategy: 'proportional' },
      actor: 'pos:99'
    });

    expect(result.success).toBe(true);
    expect(result.data.refund).toEqual(expect.objectContaining({
      status: 'pending',
      failure_code: 'PROVIDER_REFUND_PENDING_RECONCILIATION'
    }));
    expect(result.data.provider_confirmation_required).toBe(true);
    expect(commercePaymentRepository.updateSessionById).toHaveBeenCalledWith(baseSession.session_id, {
      status: 'refund_pending'
    });
  });

  it('reconciles refund webhooks by provider refund id before session metadata lookup', async () => {
    const commercePaymentRepository = buildRepository({
      sumRefundCentavosByStatuses: jest.fn()
        .mockResolvedValueOnce(10000)
        .mockResolvedValueOnce(0)
    });
    const paymongoService = {
      verifyWebhookSignature: jest.fn().mockReturnValue(true)
    };
    const useCase = buildHandlePayMongoCommerceWebhookUseCase({
      commercePaymentRepository,
      paymongoService,
      logger: { warn: jest.fn() },
      recordSucceededRevenueRefund: jest.fn().mockResolvedValue({ success: true, data: null })
    });

    const result = await useCase({
      headers: { 'paymongo-signature': 'valid' },
      rawBody: '{}',
      body: {
        data: {
          id: 'evt_refund',
          attributes: {
            type: 'payment.refund.updated',
            data: {
              id: 'ref_test',
              type: 'refund',
              attributes: { status: 'succeeded' }
            }
          }
        }
      }
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({
      handled: true,
      status: 'refund_updated',
      payment_session: baseSession.public_reference
    }));
    expect(commercePaymentRepository.findRefundByProviderId).toHaveBeenCalledWith('ref_test');
    expect(commercePaymentRepository.updateSessionById).toHaveBeenCalledWith(baseSession.session_id, {
      status: 'refunded'
    });
  });

  it('normalizes legacy custom split requests to proportional refunds in collect-and-settle mode', async () => {
    const commercePaymentRepository = buildRepository();
    const paymongoService = {
      createRefund: jest.fn()
    };
    const useCase = buildCreateCommercePaymentRefundUseCase({
      commercePaymentRepository,
      paymongoService,
      revenueSharingEnabled: true
    });

    const result = await useCase({
      paymentSessionId: baseSession.public_reference,
      payload: {
        amount_centavos: 5000,
        refund_strategy: 'custom',
        refund_sources: [{ merchant_id: 'org_child', split_type: 'fixed', value: 3000 }]
      },
      actor: 'admin'
    });

    expect(result.success).toBe(true);
    expect(commercePaymentRepository.createRefund).toHaveBeenCalledWith(expect.objectContaining({
      refund_strategy: 'proportional',
      split_refund_payload: null
    }));
    expect(paymongoService.createRefund).toHaveBeenCalledWith(expect.objectContaining({
      amount: 5000,
      splitRefund: null
    }));
  });
});

// --- Phase 144 (#824): tenant-side pos_order_payments mirroring -------------------------------
//
// A refund is recorded landlord-side in commerce_payment_refunds. For a DOWNPAYMENT order it must
// also appear in the tenant's own per-order ledger, next to the kind:'downpayment' capture row
// Phase 141 wrote — otherwise the tenant's ledger shows money coming in and never going back out.

const downpaymentSession = {
  ...baseSession,
  session_id: 11,
  public_reference: 'CPS-DOWN123456',
  pos_transaction_id: 903,
  capture_kind: 'downpayment',
  capture_payment_method: 'gcash',
  order_total_centavos: 100000,
  total_amount_centavos: 20000,
  downpayment_refundable: true
};

describe('tenant order-payment ledger mirroring (Phase 144, #824)', () => {
  it('records a pending refund row when the provider has not confirmed yet', async () => {
    const repository = buildRepository({
      findSessionByPublicReference: jest.fn().mockResolvedValue(downpaymentSession),
      findSessionBySessionId: jest.fn().mockResolvedValue(downpaymentSession)
    });
    const writeOrderPaymentLedgerEntry = jest.fn().mockResolvedValue({ written: true, entryId: 71 });
    const useCase = buildCreateCommercePaymentRefundUseCase({
      commercePaymentRepository: repository,
      paymongoService: {
        createRefund: jest.fn().mockResolvedValue({ id: 'ref_pending', attributes: { status: 'pending' } })
      },
      writeOrderPaymentLedgerEntry
    });

    const result = await useCase({
      paymentSessionId: downpaymentSession.public_reference,
      payload: { amount_centavos: 20000, refund_strategy: 'proportional' },
      actor: 'pos_user:8'
    });

    expect(result.success).toBe(true);
    expect(writeOrderPaymentLedgerEntry).toHaveBeenCalledTimes(1);
    expect(writeOrderPaymentLedgerEntry).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'refund',
      status: 'pending',
      amountCentavos: 20000,
      paymentMethod: 'gcash',
      idempotencyKey: expect.stringMatching(/^CRF-[0-9A-F]{10}$/)
    }));
  });

  it('records a failed refund row when the provider rejects outright', async () => {
    const repository = buildRepository({
      findSessionByPublicReference: jest.fn().mockResolvedValue(downpaymentSession),
      findSessionBySessionId: jest.fn().mockResolvedValue(downpaymentSession)
    });
    const writeOrderPaymentLedgerEntry = jest.fn().mockResolvedValue({ written: true, entryId: 72 });
    const providerError = new Error('rejected');
    providerError.response = { status: 400, data: { errors: [{ detail: 'Refund not allowed' }] } };
    const useCase = buildCreateCommercePaymentRefundUseCase({
      commercePaymentRepository: repository,
      paymongoService: { createRefund: jest.fn().mockRejectedValue(providerError) },
      writeOrderPaymentLedgerEntry
    });

    const result = await useCase({
      paymentSessionId: downpaymentSession.public_reference,
      payload: { amount_centavos: 20000, refund_strategy: 'proportional' },
      actor: 'pos_user:8'
    });

    expect(result.success).toBe(true);
    expect(writeOrderPaymentLedgerEntry).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'refund',
      status: 'failed'
    }));
  });

  // The async half: PayMongo confirms later, and the pending row must be promoted rather than a
  // second row appended.
  it('promotes the tenant ledger row when the refund webhook confirms success', async () => {
    const repository = buildRepository({
      findSessionBySessionId: jest.fn().mockResolvedValue(downpaymentSession)
    });
    const updateOrderPaymentLedgerEntryStatus = jest.fn().mockResolvedValue({ updated: true, entryId: 71 });
    const webhook = buildHandlePayMongoCommerceWebhookUseCase({
      commercePaymentRepository: repository,
      paymongoService: { verifyWebhookSignature: jest.fn().mockReturnValue(true) },
      logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
      recordSucceededRevenueRefund: jest.fn().mockResolvedValue({ success: true, data: {} }),
      updateOrderPaymentLedgerEntryStatus
    });

    const result = await webhook({
      headers: { 'paymongo-signature': 'sig' },
      rawBody: '{}',
      body: {
        data: {
          id: 'evt_refund_1',
          attributes: {
            type: 'payment.refunded',
            data: { id: 'ref_test', type: 'refund', attributes: { status: 'succeeded' } }
          }
        }
      }
    });

    expect(result.data).toEqual(expect.objectContaining({ handled: true, status: 'refund_updated' }));
    expect(updateOrderPaymentLedgerEntryStatus).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: 'CRF-ABC123DEF4',
      status: 'successful',
      providerEventId: 'evt_refund_1'
    }));
  });

  // Best-effort by contract: a tenant database that cannot be reached must never make PayMongo
  // retry a money event.
  it('still acknowledges the refund webhook when the tenant ledger update fails', async () => {
    const repository = buildRepository({
      findSessionBySessionId: jest.fn().mockResolvedValue(downpaymentSession)
    });
    const webhook = buildHandlePayMongoCommerceWebhookUseCase({
      commercePaymentRepository: repository,
      paymongoService: { verifyWebhookSignature: jest.fn().mockReturnValue(true) },
      logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
      recordSucceededRevenueRefund: jest.fn().mockResolvedValue({ success: true, data: {} }),
      updateOrderPaymentLedgerEntryStatus: jest.fn().mockResolvedValue({ updated: false, reason: 'tenant_unreachable' })
    });

    const result = await webhook({
      headers: { 'paymongo-signature': 'sig' },
      rawBody: '{}',
      body: {
        data: {
          id: 'evt_refund_2',
          attributes: {
            type: 'payment.refunded',
            data: { id: 'ref_test', type: 'refund', attributes: { status: 'succeeded' } }
          }
        }
      }
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({ handled: true, status: 'refund_updated' }));
  });
});
