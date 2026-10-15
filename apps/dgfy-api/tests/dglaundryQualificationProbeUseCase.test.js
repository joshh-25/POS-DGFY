import { jest } from '@jest/globals';
import { buildDglaundryQualificationProbeUseCase, DGLAUNDRY_QUALIFICATION_ORDER_REFERENCE } from '../src/modules/dgfyLaundryOrders/usecases/dglaundryQualificationProbeUseCase.js';

const originalEnvironment = { ...process.env };
const fixedNow = new Date('2026-10-08T10:00:00.000Z');
const fixtureSession = () => ({
  session_id: 71,
  public_reference: 'CPS-QUALIFICATION-0001',
  target_type: 'dglaundry_booking',
  status: 'finalized',
  provider: 'paymongo',
  provider_payment_id: 'pay_test_qualification',
  provider_payment_intent_id: 'pi_test_qualification',
  total_amount_centavos: 1000,
  expires_at: new Date(fixedNow.getTime() - 1000),
  checkout_payload: {
    external_order_reference: DGLAUNDRY_QUALIFICATION_ORDER_REFERENCE,
    external_tracking_reference: 'tracking-ref',
    company_id: 'company-fixture',
    location_id: 'location-fixture',
    dglaundry_submission: { externalOrderReference: DGLAUNDRY_QUALIFICATION_ORDER_REFERENCE }
  }
});

const makeUseCase = (kind, overrides = {}) => {
  const session = fixtureSession();
  if (kind === 'expire') session.status = 'pending';
  const idempotency = new Map();
  const dependencies = {
    orderRepository: {
      getOrder: jest.fn(async () => ({ status: 'received', external_tracking_reference: 'tracking-ref', dgfy_account_id: null, aggregate_version: 1 })),
      findIdempotency: jest.fn(async (key) => idempotency.get(key) || null),
      saveIdempotency: jest.fn(async ({ key, requestHash, operation, response }) => {
        if (!idempotency.has(key)) idempotency.set(key, { idempotency_key: key, request_hash: requestHash, operation, response });
        return idempotency.get(key);
      }),
      updateIdempotencyResponse: jest.fn(async (key, response) => {
        const row = idempotency.get(key);
        if (row) row.response = response;
        return row;
      })
    },
    mappingRepository: { findActiveMapping: jest.fn(async () => ({ status: 'active' })) },
    orderUseCases: {
      cancelOrder: jest.fn(async () => ({ response: { state: 'cancelled' } })),
      confirmReceipt: jest.fn(async () => ({ response: { state: 'receipt_confirmed' } }))
    },
    paymentRepository: {
      findSessionByPublicReference: jest.fn(async () => session),
      sumRefundedCentavos: jest.fn(async () => 0),
      updateSessionById: jest.fn(async (_id, update) => ({ ...session, ...update }))
    },
    paymongoService: { retrievePaymentIntent: jest.fn(async () => ({ id: 'pi_test_qualification', attributes: { status: 'expired' } })) },
    createRefundUseCase: jest.fn(async () => ({ success: true, data: { refund: { status: 'succeeded', refund_id: 'refund-1', amount_centavos: 1000 }, payment_session: session } })),
    partnerClient: { cancelOrder: jest.fn(async () => ({})), updateOrder: jest.fn(async () => ({})) },
    now: () => fixedNow,
    ...overrides
  };
  return { useCase: buildDglaundryQualificationProbeUseCase(dependencies), dependencies };
};

describe('DGLaundry qualification probes', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'staging';
    process.env.PAYMONGO_MODE = 'test';
    process.env.DGLAUNDRY_QUALIFICATION_COMPANY_ID = 'company-fixture';
    process.env.DGLAUNDRY_QUALIFICATION_LOCATION_ID = 'location-fixture';
    process.env.DGLAUNDRY_QUALIFICATION_PAYMENT_SESSION_REFERENCE = 'CPS-QUALIFICATION-0001';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
    Object.assign(process.env, originalEnvironment);
  });

  it.each(['cancel', 'expire', 'refund', 'receipt'])('rejects %s for any order except the reserved fixture', async (kind) => {
    const { useCase, dependencies } = makeUseCase(kind);
    await expect(useCase({ kind, externalOrderReference: 'DGL-OTHER-ORDER', idempotencyKey: 'qualification-probe-key-001' }))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(dependencies.orderRepository.getOrder).not.toHaveBeenCalled();
  });

  it.each([
    ['cancel', 'cancelled'],
    ['expire', 'expired'],
    ['refund', 'succeeded'],
    ['receipt', 'receipt_confirmed']
  ])('runs the %s domain path for the reserved sandbox order and reports its readback', async (kind, state) => {
    const { useCase, dependencies } = makeUseCase(kind);
    const result = await useCase({ kind, externalOrderReference: DGLAUNDRY_QUALIFICATION_ORDER_REFERENCE, idempotencyKey: 'qualification-probe-key-001' });

    expect(result).toMatchObject({ externalOrderReference: DGLAUNDRY_QUALIFICATION_ORDER_REFERENCE, state, paymentMode: 'test', companyId: 'company-fixture', locationId: 'location-fixture' });
    if (kind === 'cancel') expect(dependencies.orderUseCases.cancelOrder).toHaveBeenCalled();
    if (kind === 'expire') {
      expect(dependencies.paymongoService.retrievePaymentIntent).toHaveBeenCalledWith('pi_test_qualification');
      expect(dependencies.paymentRepository.updateSessionById).toHaveBeenCalledWith(71, expect.objectContaining({ status: 'expired' }));
    }
    if (kind === 'refund') expect(dependencies.createRefundUseCase).toHaveBeenCalledWith(expect.objectContaining({ paymentSessionId: 'CPS-QUALIFICATION-0001' }));
    if (kind === 'receipt') expect(dependencies.orderUseCases.confirmReceipt).toHaveBeenCalled();
  });

  it('replays the saved refund probe result without submitting a second refund', async () => {
    const { useCase, dependencies } = makeUseCase('refund');
    const request = { kind: 'refund', externalOrderReference: DGLAUNDRY_QUALIFICATION_ORDER_REFERENCE, idempotencyKey: 'qualification-refund-key-001' };
    const first = await useCase(request);
    const replay = await useCase(request);

    expect(replay).toEqual(first);
    expect(dependencies.createRefundUseCase).toHaveBeenCalledTimes(1);
  });
});
