import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('../src/config/tenantRevenueFeature.js', () => ({
  tenantRevenueSharingEnabled: true,
  tenantRevenueAutomaticPayoutEnabled: false,
  tenantRevenueExternalPayoutApproved: false,
  tenantRevenueDefaultRateBps: 100,
  tenantRevenueDefaultSettlementCycleDays: 15,
  canUseAutomaticTenantPayouts: false
}));

const { buildTenantRevenueUseCases } = await import(
  '../src/modules/tenantRevenue/usecases/tenantRevenueUseCases.js'
);

const transactionContext = { LOCK: { UPDATE: 'UPDATE' } };
const runInTransaction = (callback) => callback(transactionContext);

const makeRevenue = (overrides = {}) => ({
  revenue_transaction_id: 10,
  tenant_id: '9e4897ab-0f44-4fc2-b388-e9b2f0669511',
  payment_session_id: 5,
  provider_payment_id: 'pay_original',
  currency: 'PHP',
  gross_amount_centavos: 30000,
  provider_fee_centavos: 800,
  provider_fee_vat_centavos: 0,
  provider_net_centavos: 29200,
  dgfy_rate_bps: 200,
  dgfy_fee_centavos: 600,
  tenant_provider_fee_centavos: 800,
  dgfy_provider_fee_centavos: 0,
  refund_centavos: 0,
  chargeback_centavos: 0,
  adjustment_centavos: 0,
  tenant_net_payable_centavos: 28600,
  settlement_cycle_days: 15,
  payment_status: 'paid',
  reconciliation_status: 'reconciled',
  settlement_status: 'pending',
  fulfillment_status: 'pending',
  eligibility_at: new Date('2026-08-14T00:00:00.000Z'),
  paid_at: new Date('2026-07-30T00:00:00.000Z'),
  financial_snapshot: {
    policy: {
      dgfy_rate_bps: 200,
      provider_fee_payer: 'tenant',
      shared_fee_tenant_bps: null,
      settlement_status: 'active'
    }
  },
  ...overrides
});

const makeRepository = (overrides = {}) => ({
  runInTransaction: jest.fn(runInTransaction),
  findTenantById: jest.fn(),
  findLatestFeePolicy: jest.fn(),
  findEffectiveFeePolicy: jest.fn(),
  listFeePolicies: jest.fn().mockResolvedValue([]),
  createFeePolicy: jest.fn(),
  updateFeePolicy: jest.fn(),
  findRevenueTransactionBySession: jest.fn(),
  findRevenueTransactionByProviderPayment: jest.fn(),
  findRevenueTransactionById: jest.fn(),
  createRevenueTransaction: jest.fn(),
  updateRevenueTransaction: jest.fn(),
  createLedgerEntry: jest.fn().mockResolvedValue({ entry: {}, created: true }),
  listLedgerEntries: jest.fn().mockResolvedValue([]),
  createReconciliationRecord: jest.fn().mockResolvedValue({}),
  listReconciliationRecords: jest.fn().mockResolvedValue([]),
  updateReconciliationRecord: jest.fn(),
  listRevenueTransactions: jest.fn().mockResolvedValue([]),
  countRevenueTransactions: jest.fn().mockResolvedValue(0),
  listEligibleUnbatchedTransactions: jest.fn().mockResolvedValue([]),
  findSettlementItemByRevenueTransaction: jest.fn().mockResolvedValue(null),
  listEligibleCarryforwardLedgerEntries: jest.fn().mockResolvedValue([]),
  createSettlementBatch: jest.fn(),
  createSettlementBatchItems: jest.fn().mockResolvedValue([]),
  createSettlementBatchLedgerItems: jest.fn().mockResolvedValue([]),
  findSettlementBatchById: jest.fn(),
  listSettlementBatches: jest.fn().mockResolvedValue([]),
  updateSettlementBatch: jest.fn(),
  deleteSettlementBatchItems: jest.fn(),
  deleteSettlementBatchLedgerItems: jest.fn(),
  findPayoutByIdempotency: jest.fn(),
  createPayout: jest.fn(),
  updatePayout: jest.fn(),
  findPayoutById: jest.fn(),
  listPayouts: jest.fn().mockResolvedValue([]),
  findAdjustmentByIdempotency: jest.fn(),
  findAdjustmentById: jest.fn(),
  createAdjustment: jest.fn(),
  updateAdjustment: jest.fn(),
  listAdjustments: jest.fn().mockResolvedValue([]),
  createAuditLog: jest.fn().mockResolvedValue({}),
  ...overrides
});

const build = (repository) => buildTenantRevenueUseCases({
  tenantRevenueRepository: repository,
  payoutDestinationCrypto: {
    encryptPayoutDestination: jest.fn((value) => JSON.stringify(value)),
    maskPayoutDestination: jest.fn(() => 'Bank •••• 1234')
  }
});

describe('Tenant revenue workflow controls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps paid orders on hold until fulfillment completes', async () => {
    const revenue = makeRevenue({ settlement_status: 'on_hold' });
    const repository = makeRepository({
      findRevenueTransactionBySession: jest.fn().mockResolvedValue(revenue),
      updateRevenueTransaction: jest.fn(async (id, payload) => ({
        ...revenue,
        revenue_transaction_id: id,
        ...payload
      }))
    });
    const useCases = build(repository);

    const result = await useCases.recordOrderFulfillment({
      session: { session_id: revenue.payment_session_id, public_reference: 'CPS-10' },
      fulfillmentStatus: 'completed',
      actor: 'pos_user:8'
    });

    expect(result.success).toBe(true);
    expect(repository.updateRevenueTransaction).toHaveBeenCalledWith(
      revenue.revenue_transaction_id,
      expect.objectContaining({
        fulfillment_status: 'completed',
        settlement_status: 'pending'
      }),
      expect.objectContaining({ lock: true })
    );
  });

  it('repairs a completed settlement hold when MySQL returns the snapshot as JSON text', async () => {
    const revenue = makeRevenue({
      fulfillment_status: 'completed',
      settlement_status: 'on_hold',
      financial_snapshot: JSON.stringify({
        policy: { settlement_status: 'active' }
      })
    });
    const repository = makeRepository({
      findRevenueTransactionBySession: jest.fn().mockResolvedValue(revenue),
      updateRevenueTransaction: jest.fn(async (id, payload) => ({
        ...revenue,
        revenue_transaction_id: id,
        ...payload
      }))
    });
    const useCases = build(repository);

    const result = await useCases.recordOrderFulfillment({
      session: { session_id: revenue.payment_session_id, public_reference: 'CPS-10' },
      fulfillmentStatus: 'completed',
      actor: 'pos_user:8'
    });

    expect(result.success).toBe(true);
    expect(result.data.updated).toBe(true);
    expect(repository.updateRevenueTransaction).toHaveBeenCalledWith(
      revenue.revenue_transaction_id,
      expect.objectContaining({
        fulfillment_status: 'completed',
        settlement_status: 'pending'
      }),
      expect.objectContaining({ lock: true })
    );
  });

  it('reverses the DGFY fee when a full refund succeeds', async () => {
    const revenue = makeRevenue({ settlement_status: 'on_hold' });
    const repository = makeRepository({
      findRevenueTransactionBySession: jest.fn().mockResolvedValue(revenue),
      updateRevenueTransaction: jest.fn(async (id, payload) => ({
        ...revenue,
        revenue_transaction_id: id,
        ...payload
      }))
    });
    const useCases = build(repository);

    const result = await useCases.recordSucceededRefund({
      session: { session_id: revenue.payment_session_id },
      refund: {
        refund_id: 21,
        provider_refund_id: 'ref_full',
        amount_centavos: revenue.gross_amount_centavos
      }
    });

    expect(result.success).toBe(true);
    expect(repository.createLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entry_type: 'reversal',
        debit_account: 'dgfy_platform_revenue',
        credit_account: 'tenant_payable',
        amount_centavos: revenue.dgfy_fee_centavos
      }),
      expect.objectContaining({ transaction: transactionContext })
    );
    expect(repository.updateRevenueTransaction).toHaveBeenCalledWith(
      revenue.revenue_transaction_id,
      expect.objectContaining({
        payment_status: 'refunded',
        settlement_status: 'reversed',
        tenant_net_payable_centavos: -800
      }),
      expect.objectContaining({ lock: true })
    );
  });

  it.each([
    [15, '2026-08-14T00:00:00.000Z'],
    [30, '2026-08-29T00:00:00.000Z']
  ])('snapshots a historical policy and calculates a %s-day eligibility date', async (cycle, expectedDate) => {
    const policy = {
      policy_id: 2,
      version: 2,
      dgfy_rate_bps: 300,
      settlement_cycle_days: String(cycle),
      settlement_status: 'active',
      minimum_payout_centavos: 0,
      currency: 'PHP',
      provider_fee_payer: 'tenant',
      shared_fee_tenant_bps: null,
      fallback_fee_policy: null,
      payout_destination_masked: 'BDO ••••1234',
      automatic_payout_enabled: false,
      effective_at: new Date('2026-07-01T00:00:00.000Z')
    };
    const repository = makeRepository({
      findRevenueTransactionBySession: jest.fn().mockResolvedValue(null),
      findEffectiveFeePolicy: jest.fn().mockResolvedValue(policy),
      createRevenueTransaction: jest.fn(async (payload) => ({
        revenue_transaction_id: 20,
        ...payload
      }))
    });
    const useCases = build(repository);

    const result = await useCases.postPaidTransaction({
      session: {
        session_id: 8,
        tenant_id: makeRevenue().tenant_id,
        total_amount_centavos: 30000,
        paid_at: '2026-07-30T00:00:00.000Z',
        currency: 'PHP',
        checkout_payload: { company_id: 'company-a', branch_id: 'branch-a' }
      },
      resource: {
        id: `pay_cycle_${cycle}`,
        attributes: {
          amount: 30000,
          fee: 800,
          net_amount: 29200,
          payment_method_type: 'card'
        }
      },
      providerEventId: `evt_cycle_${cycle}`
    });

    expect(result.success).toBe(true);
    expect(result.data.posted).toBe(true);
    const posted = repository.createRevenueTransaction.mock.calls[0][0];
    expect(posted.dgfy_rate_bps).toBe(300);
    expect(posted.dgfy_fee_centavos).toBe(900);
    expect(posted.tenant_net_payable_centavos).toBe(28300);
    expect(new Date(posted.eligibility_at).toISOString()).toBe(expectedDate);
    expect(posted.financial_snapshot.policy.version).toBe(2);
  });

  it('treats a repeated successful webhook as an idempotent replay', async () => {
    const existing = makeRevenue();
    const repository = makeRepository({
      findRevenueTransactionBySession: jest.fn().mockResolvedValue(existing)
    });
    const useCases = build(repository);

    const result = await useCases.postPaidTransaction({
      session: { session_id: 5, tenant_id: existing.tenant_id },
      resource: { id: existing.provider_payment_id },
      providerEventId: 'evt_duplicate'
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ posted: false, reason: 'already_posted' });
    expect(repository.createRevenueTransaction).not.toHaveBeenCalled();
    expect(repository.createLedgerEntry).not.toHaveBeenCalled();
  });

  it('creates a new effective fee version without overwriting the historical version', async () => {
    const latest = {
      policy_id: 1,
      version: 1,
      dgfy_rate_bps: 200,
      settlement_cycle_days: '15',
      settlement_status: 'active',
      effective_at: new Date('2026-07-01T00:00:00.000Z'),
      ends_at: null,
      payout_destination_encrypted: 'encrypted',
      payout_destination_masked: 'BDO ••••1234'
    };
    const repository = makeRepository({
      findTenantById: jest.fn().mockResolvedValue({ id: makeRevenue().tenant_id }),
      findLatestFeePolicy: jest.fn().mockResolvedValue(latest),
      updateFeePolicy: jest.fn().mockResolvedValue({ ...latest, ends_at: new Date() }),
      createFeePolicy: jest.fn(async (payload) => ({ policy_id: 2, ...payload }))
    });
    const useCases = build(repository);

    const result = await useCases.createFeePolicy({
      tenantId: makeRevenue().tenant_id,
      actor: 'finance-admin',
      payload: {
        dgfy_rate_bps: 300,
        settlement_cycle_days: 30,
        settlement_status: 'active',
        minimum_payout_centavos: 10000,
        provider_fee_payer: 'tenant',
        fallback_fee_policy: {
          card: { rate_bps: 350, fixed_centavos: 1500 }
        },
        automatic_payout_enabled: false,
        effective_at: '2026-08-01T00:00:00.000Z',
        reason: 'Approved commercial rate update.'
      }
    });

    expect(result.success).toBe(true);
    expect(repository.updateFeePolicy).toHaveBeenCalledWith(
      1,
      { ends_at: new Date('2026-07-31T23:59:59.999Z') },
      expect.objectContaining({ lock: true })
    );
    expect(repository.createFeePolicy.mock.calls[0][0]).toMatchObject({
      version: 2,
      dgfy_rate_bps: 300,
      settlement_cycle_days: '30',
      payout_destination_encrypted: 'encrypted'
    });
  });

  it('records full and partial refunds idempotently and preserves a paid settlement for carry-forward', async () => {
    const revenue = makeRevenue({ settlement_status: 'settled' });
    const repository = makeRepository({
      findRevenueTransactionBySession: jest.fn().mockResolvedValue(revenue),
      findSettlementItemByRevenueTransaction: jest.fn().mockResolvedValue({
        batch: { settlement_batch_id: 4, status: 'paid' }
      }),
      updateRevenueTransaction: jest.fn(async (_id, payload) => ({ ...revenue, ...payload }))
    });
    const useCases = build(repository);

    const partial = await useCases.recordSucceededRefund({
      session: { session_id: revenue.payment_session_id },
      refund: { refund_id: 1, provider_refund_id: 'ref_partial', amount_centavos: 10000 }
    });

    expect(partial.success).toBe(true);
    expect(partial.data.transaction.payment_status).toBe('partially_refunded');
    expect(partial.data.transaction.settlement_status).toBe('settled');
    expect(partial.data.transaction.tenant_net_payable_centavos).toBe(18800);

    repository.findRevenueTransactionBySession.mockResolvedValue({
      ...revenue,
      refund_centavos: 10000,
      tenant_net_payable_centavos: 18800
    });
    const full = await useCases.recordSucceededRefund({
      session: { session_id: revenue.payment_session_id },
      refund: { refund_id: 2, provider_refund_id: 'ref_full', amount_centavos: 20000 }
    });

    expect(full.success).toBe(true);
    expect(full.data.transaction.payment_status).toBe('refunded');
    expect(full.data.transaction.tenant_net_payable_centavos).toBe(-800);
  });

  it('posts a chargeback once and carries a paid-tenant deduction forward', async () => {
    const revenue = makeRevenue({ settlement_status: 'settled' });
    const repository = makeRepository({
      findRevenueTransactionBySession: jest.fn().mockResolvedValue(revenue),
      findSettlementItemByRevenueTransaction: jest.fn().mockResolvedValue({
        batch: { settlement_batch_id: 4, status: 'paid' }
      }),
      updateRevenueTransaction: jest.fn(async (_id, payload) => ({ ...revenue, ...payload }))
    });
    const useCases = build(repository);

    const result = await useCases.recordChargeback({
      session: { session_id: revenue.payment_session_id },
      resource: { id: 'cb_001', attributes: { amount: 30000 } },
      providerEventId: 'evt_chargeback'
    });

    expect(result.success).toBe(true);
    expect(result.data.transaction).toMatchObject({
      payment_status: 'chargeback',
      reconciliation_status: 'exception',
      settlement_status: 'settled',
      chargeback_centavos: 30000,
      tenant_net_payable_centavos: -1400
    });
    expect(repository.createLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entry_type: 'chargeback',
        idempotency_key: 'chargeback:cb_001'
      }),
      expect.any(Object)
    );
  });

  it('adds paid-transaction refund carry-forwards to the next positive batch exactly once', async () => {
    const revenue = makeRevenue();
    const carryforward = {
      ledger_entry_id: 91,
      entry_type: 'refund',
      amount_centavos: 1000,
      debit_account: 'tenant_payable',
      credit_account: 'paymongo_clearing'
    };
    const repository = makeRepository({
      findTenantById: jest.fn().mockResolvedValue({ id: revenue.tenant_id }),
      findEffectiveFeePolicy: jest.fn().mockResolvedValue({
        policy_id: 3,
        settlement_status: 'active',
        minimum_payout_centavos: 0,
        payout_destination_masked: 'BDO ••••1234'
      }),
      listEligibleUnbatchedTransactions: jest.fn().mockResolvedValue([revenue]),
      listEligibleCarryforwardLedgerEntries: jest.fn().mockResolvedValue([carryforward]),
      createSettlementBatch: jest.fn(async (payload) => ({
        settlement_batch_id: 17,
        ...payload
      })),
      updateRevenueTransaction: jest.fn(async (_id, payload) => ({ ...revenue, ...payload }))
    });
    const useCases = build(repository);

    const result = await useCases.createSettlementBatch({
      actor: 'finance-maker',
      payload: {
        tenant_id: revenue.tenant_id,
        period_start: '2026-07-01T00:00:00.000Z',
        period_end: '2026-08-31T23:59:59.999Z'
      }
    });

    expect(result.success).toBe(true);
    expect(repository.createSettlementBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        gross_centavos: 30000,
        provider_fee_centavos: 800,
        dgfy_fee_centavos: 600,
        refund_centavos: 1000,
        payout_centavos: 27600
      }),
      expect.any(Object)
    );
    expect(repository.createSettlementBatchLedgerItems).toHaveBeenCalledWith([{
      settlement_batch_id: 17,
      ledger_entry_id: 91,
      included_adjustment_centavos: -1000
    }], expect.any(Object));
  });

  it('requires an independent administrator before posting a manual adjustment', async () => {
    const revenue = makeRevenue();
    const adjustment = {
      adjustment_id: 31,
      tenant_id: revenue.tenant_id,
      revenue_transaction_id: revenue.revenue_transaction_id,
      amount_centavos: -500,
      reason: 'Approved service recovery deduction.',
      status: 'pending',
      requested_by: 'finance-maker'
    };
    const repository = makeRepository({
      findAdjustmentById: jest.fn().mockResolvedValue(adjustment),
      findRevenueTransactionById: jest.fn().mockResolvedValue(revenue),
      updateRevenueTransaction: jest.fn(async (_id, payload) => ({ ...revenue, ...payload })),
      updateAdjustment: jest.fn(async (_id, payload) => ({ ...adjustment, ...payload }))
    });
    const useCases = build(repository);

    const rejected = await useCases.approveAdjustment({
      adjustmentId: 31,
      payload: { reason: 'Reviewed supporting evidence.' },
      actor: 'finance-maker'
    });
    expect(rejected.success).toBe(false);
    expect(rejected.error.message).toContain('requester cannot approve');

    const accepted = await useCases.approveAdjustment({
      adjustmentId: 31,
      payload: { reason: 'Reviewed supporting evidence.' },
      actor: 'authorized-approver'
    });
    expect(accepted.success).toBe(true);
    expect(repository.createLedgerEntry).toHaveBeenLastCalledWith(
      expect.objectContaining({
        entry_type: 'adjustment',
        amount_centavos: 500,
        approved_by: 'authorized-approver'
      }),
      expect.any(Object)
    );
    expect(repository.updateRevenueTransaction).toHaveBeenLastCalledWith(
      revenue.revenue_transaction_id,
      expect.objectContaining({
        adjustment_centavos: -500,
        tenant_net_payable_centavos: 28100
      }),
      expect.any(Object)
    );
  });

  it('blocks self-approval of settlement batches and accepts an independent approver', async () => {
    const batch = {
      settlement_batch_id: 7,
      status: 'prepared',
      prepared_by: 'finance-maker',
      items: []
    };
    const repository = makeRepository({
      findSettlementBatchById: jest.fn().mockResolvedValue(batch),
      updateSettlementBatch: jest.fn(async (_id, payload) => ({ ...batch, ...payload }))
    });
    const useCases = build(repository);

    const rejected = await useCases.approveSettlementBatch({
      settlementBatchId: 7,
      payload: { reason: 'Reviewed totals.' },
      actor: 'finance-maker'
    });
    expect(rejected.success).toBe(false);
    expect(rejected.error.message).toContain('preparer cannot approve');

    const approved = await useCases.approveSettlementBatch({
      settlementBatchId: 7,
      payload: { reason: 'Reviewed totals.' },
      actor: 'authorized-approver'
    });
    expect(approved.success).toBe(true);
    expect(repository.updateSettlementBatch).toHaveBeenLastCalledWith(
      7,
      expect.objectContaining({ status: 'approved', approved_by: 'authorized-approver' }),
      expect.any(Object)
    );
  });

  it('requires the original settlement approver to authorize a failed payout retry', async () => {
    const failedPayout = {
      payout_id: 11,
      settlement_batch_id: 7,
      tenant_id: makeRevenue().tenant_id,
      amount_centavos: 28600,
      currency: 'PHP',
      method: 'manual_bank',
      destination_masked: 'BDO ••••1234',
      status: 'failed'
    };
    const batch = {
      settlement_batch_id: 7,
      status: 'failed',
      approved_by: 'authorized-approver',
      items: []
    };
    const repository = makeRepository({
      findPayoutByIdempotency: jest.fn().mockResolvedValue(null),
      findPayoutById: jest.fn().mockResolvedValue(failedPayout),
      findSettlementBatchById: jest.fn().mockResolvedValue(batch),
      createPayout: jest.fn(async (payload) => ({ payout_id: 12, ...payload })),
      updateSettlementBatch: jest.fn(async (_id, payload) => ({ ...batch, ...payload }))
    });
    const useCases = build(repository);

    const rejected = await useCases.retryManualPayout({
      payoutId: 11,
      payload: { idempotency_key: 'retry-not-approved', reason: 'Retry after transfer failure.' },
      actor: 'finance-maker'
    });
    expect(rejected.success).toBe(false);
    expect(rejected.error.message).toContain('authorized settlement approver');

    const accepted = await useCases.retryManualPayout({
      payoutId: 11,
      payload: { idempotency_key: 'retry-approved-001', reason: 'Retry after transfer failure.' },
      actor: 'authorized-approver'
    });
    expect(accepted.success).toBe(true);
    expect(accepted.data.payout.status).toBe('approved');
  });

  it('allows only the batch approver to confirm payout evidence', async () => {
    const payout = {
      payout_id: 12,
      settlement_batch_id: 7,
      tenant_id: makeRevenue().tenant_id,
      amount_centavos: 28600,
      currency: 'PHP',
      status: 'approved',
      initiated_by: 'finance-maker'
    };
    const batch = {
      settlement_batch_id: 7,
      status: 'processing',
      approved_by: 'authorized-approver',
      items: []
    };
    const repository = makeRepository({
      findPayoutById: jest.fn().mockResolvedValue(payout),
      findSettlementBatchById: jest.fn().mockResolvedValue(batch)
    });
    const useCases = build(repository);

    const result = await useCases.confirmManualPayout({
      payoutId: 12,
      payload: {
        provider_reference: 'BANK-TRANSFER-001',
        proof_reference: 'secure-proof-object-001'
      },
      actor: 'finance-maker'
    });

    expect(result.success).toBe(false);
    expect(result.error.message).toContain('approved this settlement');
    expect(repository.createLedgerEntry).not.toHaveBeenCalled();
  });

  it('holds a mismatched provider statement row and opens a reconciliation exception', async () => {
    const revenue = makeRevenue();
    const repository = makeRepository({
      findRevenueTransactionByProviderPayment: jest.fn().mockResolvedValue(revenue),
      updateRevenueTransaction: jest.fn(async (_id, payload) => ({ ...revenue, ...payload }))
    });
    const useCases = build(repository);

    const result = await useCases.reconcileProviderFinancials({
      actor: 'finance-admin',
      payload: {
        source: 'statement',
        statement_reference: 'PM-STMT-2026-07',
        rows: [{
          provider_payment_id: revenue.provider_payment_id,
          gross_amount_centavos: 31000,
          provider_fee_centavos: 800,
          provider_net_centavos: 30200
        }]
      }
    });

    expect(result.success).toBe(true);
    expect(result.data.exceptions).toBe(1);
    expect(repository.createReconciliationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        exception_type: 'provider_gross_mismatch',
        severity: 'blocking'
      }),
      expect.any(Object)
    );
    expect(repository.updateRevenueTransaction).toHaveBeenCalledWith(
      revenue.revenue_transaction_id,
      { reconciliation_status: 'exception', settlement_status: 'on_hold' },
      expect.any(Object)
    );
  });
});
