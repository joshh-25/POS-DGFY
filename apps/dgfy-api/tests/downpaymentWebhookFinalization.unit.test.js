// Unit tests for Phase 141 (#822) -- capture: payment session + webhook finalization for partial
// payment. Two independent layers, tested separately, no database in either:
//
//   1. processVerifiedPaidCommerceSession's exact-amount-equality check (ADR 0069 clause 1b
//      [binding], carried forward by ADR 0070) must PASS for a downpayment session, comparing
//      PayMongo's reported amount against session.total_amount_centavos -- which Phase 141 makes
//      mean "the captured amount," not "the order total." No code change was made to this
//      function; this section proves the substitution in the payment-session use case is what
//      makes it fall out correctly, per the Phase 141 plan's governing-clauses table.
//      Mocking pattern matches tests/processVerifiedPaidCommerceSession.usecase.test.js exactly.
//
//   2. buildStoreCheckoutUseCase called WITH the capturedPayment sibling argument -- the exact
//      shape finalizePaidCommerceSession.js builds and passes after a webhook confirms payment.
//      Proves: the order is created cash/COD with payment_status partially_paid and correct
//      amount_paid/balance_due; ledger row 1 (kind: 'downpayment') is written via the new
//      storeRepository.createOrderPaymentEntry, inside the same transaction; and a replayed
//      delivery (same idempotency_key) is a no-op -- it never re-creates the order or re-writes
//      the ledger, because the pre-existing idempotency_key dedup short-circuits before either.
//      Fixture shapes mirror tests/storeCheckoutDownpaymentResolution.unit.test.js's checkout fixture.

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
  test
} from '@jest/globals';

const postPaidTenantRevenueTransactionUseCase = jest.fn();
const finalizePaidCommerceSession = jest.fn();
const getPaymentIdFromPayMongoResource = jest.fn(() => null);

jest.unstable_mockModule('../src/modules/tenantRevenue/index.js', () => ({
  postPaidTenantRevenueTransactionUseCase
}));
jest.unstable_mockModule('../src/modules/commercePayments/usecases/finalizePaidCommerceSession.js', () => ({
  finalizePaidCommerceSession,
  getPaymentIdFromPayMongoResource
}));

const { buildProcessVerifiedPaidCommerceSessionUseCase } = await import(
  '../src/modules/commercePayments/usecases/processVerifiedPaidCommerceSession.js'
);
const { buildStoreCheckoutUseCase } = await import('../src/modules/store/usecases/storeUseCases.js');
const { generateStoreGuestCheckoutProof } = await import('../src/modules/store/utils/storeJwtToken.js');

describe('processVerifiedPaidCommerceSession — downpayment amount equality (#822, ADR 0069 clause 1b)', () => {
  const transactionContext = { LOCK: { UPDATE: 'UPDATE' } };

  const buildRepository = (initialRows = []) => {
    const rows = new Map(initialRows.map((row) => [row.session_id, { ...row }]));
    return {
      runInTransaction: jest.fn((callback) => callback(transactionContext)),
      findSessionBySessionId: jest.fn((sessionId) => Promise.resolve(
        rows.has(sessionId) ? { ...rows.get(sessionId) } : null
      )),
      findSessionByProviderEventId: jest.fn((providerEventId) => Promise.resolve(
        [...rows.values()].find((row) => row.provider_event_id === providerEventId) || null
      )),
      updateSessionById: jest.fn((sessionId, payload) => {
        const existing = rows.get(sessionId) || {};
        const updated = { ...existing, ...payload };
        rows.set(sessionId, updated);
        return Promise.resolve({ ...updated });
      }),
      createAuditLog: jest.fn().mockResolvedValue({}),
      _rows: rows
    };
  };

  // 20% downpayment on a 505-peso order: 101 pesos captured (10100 centavos), 505 order total
  // (50500 centavos) -- same numbers as tests/storeCheckoutDownpaymentResolution.unit.test.js's
  // payment-session capture tests, so a reader cross-referencing both files sees the same order.
  const downpaymentSession = {
    session_id: 31,
    public_reference: 'CPS-DPEVENT01',
    tenant_id: '9e4897ab-0f44-4fc2-b388-e9b2f0669511',
    status: 'awaiting_payment',
    capture_kind: 'downpayment',
    total_amount_centavos: 10100,
    order_total_centavos: 50500,
    currency: 'PHP',
    provider_event_id: null,
    pos_transaction_id: null,
    tracking_pin: null
  };

  beforeEach(() => {
    jest.clearAllMocks();
    finalizePaidCommerceSession.mockImplementation(async ({ session }) => (
      session.pos_transaction_id || session.tracking_pin || session.status === 'finalized'
        ? session
        : { ...session, status: 'finalized', pos_transaction_id: 9101, tracking_pin: 'TRACKDP1' }
    ));
    postPaidTenantRevenueTransactionUseCase.mockResolvedValue({ success: true, data: { posted: true } });
  });

  it('does not flag PAYMENT_AMOUNT_MISMATCH when PayMongo reports exactly the captured (downpayment) amount, even though it differs from order_total_centavos', async () => {
    const commercePaymentRepository = buildRepository([downpaymentSession]);
    const useCase = buildProcessVerifiedPaidCommerceSessionUseCase({ commercePaymentRepository });

    const result = await useCase({
      session: downpaymentSession,
      resource: { attributes: { status: 'paid', livemode: false, amount: 10100, currency: 'PHP' } },
      providerEventId: 'evt_dp_amount_match'
    });

    expect(result).toEqual({
      handled: true,
      status: 'finalized',
      payment_session: downpaymentSession.public_reference
    });
    expect(postPaidTenantRevenueTransactionUseCase).toHaveBeenCalledTimes(1);
    expect(finalizePaidCommerceSession).toHaveBeenCalledTimes(1);
  });

  it('still flags PAYMENT_AMOUNT_MISMATCH -> paid_manual_resolution_required if PayMongo reports the order total instead of the captured amount', async () => {
    // The failure mode this equality check exists to catch, unchanged by Phase 141: if a
    // provider event ever reports the FULL order total against a downpayment session, that's a
    // real mismatch (ADR 0069 clause 1b [binding] -- captured amount only, never the total), not
    // something to silently accept.
    const commercePaymentRepository = buildRepository([downpaymentSession]);
    const useCase = buildProcessVerifiedPaidCommerceSessionUseCase({ commercePaymentRepository });

    const result = await useCase({
      session: downpaymentSession,
      resource: { attributes: { status: 'paid', livemode: false, amount: 50500, currency: 'PHP' } },
      providerEventId: 'evt_dp_amount_mismatch'
    });

    expect(result.status).toBe('paid_manual_resolution_required');
    expect(result.failure_code).toBe('PAYMENT_AMOUNT_MISMATCH');
    expect(postPaidTenantRevenueTransactionUseCase).not.toHaveBeenCalled();
    expect(finalizePaidCommerceSession).not.toHaveBeenCalled();
  });
});

describe('buildStoreCheckoutUseCase — downpayment webhook finalization (#822)', () => {
  const TENANT_ID = '22222222-2222-4222-8222-222222222222';

  const registeredTransactionSettings = () => [
    { setting_key: 'customer_access_mode', setting_value: 'transaction' },
    {
      setting_key: 'tenant_onboarding_progress',
      setting_value: JSON.stringify({
        step_payloads: { business_classification: { legitimacy: { registration_status: 'registered' } } }
      })
    }
  ];

  const fakeDownpaymentSettingsRepository = (settings) => ({
    getSettings: jest.fn().mockResolvedValue(settings)
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

  const buildFakeCheckoutStoreRepository = ({ createdOrderId = 9101 } = {}) => {
    const transaction = {
      finished: false,
      commit: jest.fn(async () => { transaction.finished = 'commit'; }),
      rollback: jest.fn(async () => { transaction.finished = 'rollback'; }),
      LOCK: { UPDATE: 'UPDATE' }
    };
    return {
      beginTransaction: jest.fn().mockResolvedValue(transaction),
      findLocationById: jest.fn().mockResolvedValue({
        location_id: 2,
        name: 'Main',
        address_line: 'Address',
        latitude: 10.7,
        longitude: 122.5,
        delivery_radius_km: 5,
        is_open: true,
        is_active: true,
        supports_delivery: true,
        supports_pickup: true,
        supports_dine_in: true,
        allow_out_of_stock_sales: false,
        current_wait_time_minutes: 15
      }),
      getSettingsByKeys: jest.fn().mockResolvedValue([
        ...registeredTransactionSettings(),
        { setting_key: 'store_delivery_fee', setting_value: '0' },
        { setting_key: 'pos_open_status', setting_value: 'true' }
      ]),
      findSellableItemsByIds: jest.fn().mockResolvedValue([
        {
          item_id: 40,
          name: 'Widget',
          current_stock: 100,
          default_sale_price: 500,
          cost_per_unit: 10,
          unit_of_measure: 'pc',
          vat_type: 'vatable'
        }
      ]),
      findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
      createOnlineTransactionWithLines: jest.fn().mockResolvedValue(createdOrderId),
      createOrderPaymentEntry: jest.fn().mockResolvedValue(701),
      getOrderById: jest.fn().mockResolvedValue({
        pos_transaction_id: createdOrderId,
        tracking_pin: 'SK-DPWEBHOOK',
        invoice_number: 'INV-000002',
        order_source: 'online_store',
        order_method: 'delivery',
        payment_type: 'cash',
        payment_status: 'partially_paid',
        fulfillment_status: 'placed',
        subtotal_amount: 500,
        discount_amount: 0,
        service_fee_amount: 5,
        delivery_fee: 0,
        total_amount: 505,
        customer_name: 'Buyer',
        customer_phone: '0917',
        customer_email: 'buyer@example.com',
        location: { location_id: 2, name: 'Main', address_line: 'Address' },
        lines: []
      }),
      nextInvoiceNumber: jest.fn().mockResolvedValue('INV-000002'),
      isTrackingPinTaken: jest.fn().mockResolvedValue(false),
      updateSettingByKey: jest.fn().mockResolvedValue({}),
      // buildOrderAccountAction (post-order-creation, unrelated to Phase 141) reaches this for a
      // guest order with an email + tracking pin -- both true for this fixture's getOrderById.
      findCustomerByEmail: jest.fn().mockResolvedValue(null),
      _transaction: transaction
    };
  };

  const checkoutPayload = (overrides = {}) => ({
    location_id: 2,
    order_method: 'delivery',
    // finalizePaidCommerceSession.js forces this to 'cash' for a downpayment capture before
    // calling storeCheckoutUseCase -- this fixture supplies that already-transformed payload,
    // matching what the real finalizer hands off, rather than re-deriving that transformation here.
    payment_type: 'cash',
    payment_status: 'paid',
    payment_provider: 'paymongo',
    payment_reference: 'pay_dp_webhook',
    payment_session_reference: 'CPS-DPWEBHOOK1',
    payment_webhook_confirmed: true,
    idempotency_key: `dp-webhook-${Math.floor(Math.random() * 1e9)}`,
    delivery_address: '123 Main St',
    delivery_latitude: 10.7,
    delivery_longitude: 122.5,
    customer_name: 'Buyer',
    customer_phone: '0917',
    customer_email: 'buyer@example.com',
    lines: [{ item_id: 40, quantity: 1 }],
    ...overrides
  });

  const capturedPaymentFor = (overrides = {}) => ({
    kind: 'downpayment',
    captured_centavos: 10100,
    order_total_centavos: 50500,
    method: 'gcash',
    provider_payment_id: 'pay_dp_webhook',
    provider_event_id: 'evt_dp_webhook_1',
    session_reference: 'CPS-DPWEBHOOK1',
    refundable: true,
    ...overrides
  });

  const withGuestProof = (payload) => ({
    ...payload,
    guest_checkout_proof: generateStoreGuestCheckoutProof({
      tenantId: TENANT_ID,
      email: payload.customer_email,
      idempotencyKey: payload.idempotency_key
    })
  });

  test('finalizes a downpayment order as COD/cash, partially_paid, with correct amount_paid/balance_due', async () => {
    const storeRepository = buildFakeCheckoutStoreRepository();
    const useCase = buildStoreCheckoutUseCase({
      storeRepository,
      downpaymentSettingsRepository: fakeDownpaymentSettingsRepository(downpaymentRequiredSettings())
    });

    const payload = checkoutPayload();
    const result = await useCase({
      tenantId: TENANT_ID,
      payload: withGuestProof(payload),
      allowExpiredGuestCheckoutProof: true,
      capturedPayment: capturedPaymentFor()
    });

    expect(result.success).toBe(true);
    expect(storeRepository.createOnlineTransactionWithLines).toHaveBeenCalledTimes(1);
    const header = storeRepository.createOnlineTransactionWithLines.mock.calls[0][0].header;
    expect(header.payment_type).toBe('cash');
    expect(header.payment_status).toBe('partially_paid');
    expect(header.amount_paid).toBe(101);
    expect(header.balance_due).toBe(404);
    expect(header.payment_reference).toBe('pay_dp_webhook');
    expect(header.payment_provider).toBe('paymongo');
  });

  test('writes ledger row 1 (kind: downpayment) inside the same transaction the order was created in', async () => {
    const storeRepository = buildFakeCheckoutStoreRepository();
    const useCase = buildStoreCheckoutUseCase({
      storeRepository,
      downpaymentSettingsRepository: fakeDownpaymentSettingsRepository(downpaymentRequiredSettings())
    });

    const payload = checkoutPayload();
    await useCase({
      tenantId: TENANT_ID,
      payload: withGuestProof(payload),
      allowExpiredGuestCheckoutProof: true,
      capturedPayment: capturedPaymentFor()
    });

    expect(storeRepository.createOrderPaymentEntry).toHaveBeenCalledTimes(1);
    const [entryArgs, entryOptions] = storeRepository.createOrderPaymentEntry.mock.calls[0];
    expect(entryArgs).toEqual(expect.objectContaining({
      posTransactionId: 9101,
      kind: 'downpayment',
      status: 'successful',
      amount: 101,
      paymentMethod: 'gcash',
      paymentProvider: 'paymongo',
      providerEventId: 'evt_dp_webhook_1',
      idempotencyKey: 'CPS-DPWEBHOOK1',
      recordedBy: null
    }));
    expect(entryOptions.transaction).toBe(storeRepository._transaction);
    // Ledger row committed as part of the same order-creation transaction -- never a separate one.
    expect(storeRepository._transaction.commit).toHaveBeenCalled();
  });

  test('a replayed webhook delivery (same idempotency_key) is a no-op -- no second order, no second ledger row', async () => {
    const storeRepository = buildFakeCheckoutStoreRepository();
    const useCase = buildStoreCheckoutUseCase({
      storeRepository,
      downpaymentSettingsRepository: fakeDownpaymentSettingsRepository(downpaymentRequiredSettings())
    });

    const payload = checkoutPayload({ idempotency_key: 'dp-webhook-replay-1' });
    const capturedPayment = capturedPaymentFor();

    // First delivery: creates the order + ledger row.
    const firstResult = await useCase({
      tenantId: TENANT_ID,
      payload: withGuestProof(payload),
      allowExpiredGuestCheckoutProof: true,
      capturedPayment
    });
    expect(firstResult.success).toBe(true);
    expect(storeRepository.createOnlineTransactionWithLines).toHaveBeenCalledTimes(1);
    expect(storeRepository.createOrderPaymentEntry).toHaveBeenCalledTimes(1);

    // Second delivery of the SAME event: findTransactionByIdempotencyKey now resolves the
    // already-created order (simulating the real repository's behavior on a genuine replay), so
    // the pre-existing idempotency dedup short-circuits before the order-creation/ledger-write
    // code is reached at all.
    const firstHeader = storeRepository.createOnlineTransactionWithLines.mock.calls[0][0].header;
    storeRepository.findTransactionByIdempotencyKey.mockResolvedValue({
      pos_transaction_id: 9101,
      idempotency_key: 'dp-webhook-replay-1',
      // Must match what buildStoreCheckoutUseCase itself computes from the (identical) replayed
      // payload, or the use case treats this as idempotency_key-reused-with-a-different-payload
      // (409 CONFLICT) rather than a genuine replay -- see storeUseCases.js's `existing.request_hash
      // !== requestHash` check.
      request_hash: firstHeader.request_hash,
      tracking_pin: 'SK-DPWEBHOOK',
      order_method: 'delivery',
      payment_type: 'cash',
      payment_status: 'partially_paid',
      location: { location_id: 2, name: 'Main', address_line: 'Address' },
      lines: []
    });

    const secondResult = await useCase({
      tenantId: TENANT_ID,
      payload: withGuestProof(payload),
      allowExpiredGuestCheckoutProof: true,
      capturedPayment
    });

    expect(secondResult.success).toBe(true);
    expect(secondResult.data.idempotent_replay).toBe(true);
    // Still exactly one call each -- the replay did not re-invoke either.
    expect(storeRepository.createOnlineTransactionWithLines).toHaveBeenCalledTimes(1);
    expect(storeRepository.createOrderPaymentEntry).toHaveBeenCalledTimes(1);
  });
});
