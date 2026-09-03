import { jest } from '@jest/globals';
import { buildCreateDglaundryBookingPaymentSessionUseCase } from '../src/modules/commercePayments/usecases/createDglaundryBookingPaymentSessionUseCase.js';

const payload = (overrides = {}) => ({
  tenant_id: 'company-a',
  company_id: 'company-a',
  location_id: 'location-a',
  mode: 'mixed',
  external_order_reference: 'order-1',
  external_tracking_reference: 'track-1',
  idempotency_key: 'booking-key-1',
  lines: [
    { mode: 'fixed', variantId: 'fixed-1', quantity: 1, externalLineReference: 'line-fixed' },
    { mode: 'per_kilo', variantId: 'kilo-1', quantity: 1, externalLineReference: 'line-kilo' }
  ],
  fulfillment: { mode: 'pickup' },
  customer: { displayName: 'Guest' },
  ...overrides
});

const repository = () => {
  let session = null;
  return {
    findSessionByIdempotency: jest.fn(async () => session),
    createSession: jest.fn(async (input) => { session = { session_id: 1, ...input }; return session; }),
    updateSessionById: jest.fn(async (_id, patch) => { session = { ...session, ...patch }; return session; })
  };
};

describe('DGLaundry booking payment session', () => {
  const previous = process.env.DGLAUNDRY_BOOKING_PAYMENTS_ENABLED;
  beforeEach(() => { process.env.DGLAUNDRY_BOOKING_PAYMENTS_ENABLED = 'true'; delete process.env.DGLAUNDRY_BOOKING_PAYMENTS_KILL_SWITCH; delete process.env.DGLAUNDRY_BOOKING_PAYMENTS_DISABLED_BRANCHES; });
  afterAll(() => { if (previous === undefined) delete process.env.DGLAUNDRY_BOOKING_PAYMENTS_ENABLED; else process.env.DGLAUNDRY_BOOKING_PAYMENTS_ENABLED = previous; });

  it('prepares mixed fixed/per-kilo children and charges only the fixed child', async () => {
    const commercePaymentRepository = repository();
    const partnerClient = { prepareBookingGroup: jest.fn(async (request) => ({ reservation: { id: `booking-${request.mode}`, quotedAmountCentavos: request.mode === 'fixed' ? 12500 : null, inventoryReservationIds: [`reservation-${request.mode}`] } })) };
    const paymongoService = { createQrphPaymentIntent: jest.fn(async () => ({ paymentIntent: { id: 'pi_1' }, paymentMethod: { id: 'pm_1' }, qrCodeImageUrl: 'https://paymongo.test/qr', expiresAt: new Date(Date.now() + 60000).toISOString() })) };
    const useCase = buildCreateDglaundryBookingPaymentSessionUseCase({ commercePaymentRepository, paymongoService, partnerClient });
    const result = await useCase({ payload: payload() });
    expect(result.success).toBe(true);
    expect(result.data.payment_required).toBe(true);
    expect(partnerClient.prepareBookingGroup).toHaveBeenCalledTimes(2);
    expect(paymongoService.createQrphPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({ amount: 12500, splitPayment: null }));
    expect(commercePaymentRepository.createSession).toHaveBeenCalledWith(expect.objectContaining({ target_type: 'dglaundry_booking', platform_fee_centavos: 0 }));
  });

  it('returns a reservation-only result for per-kilo and stays dark when the kill switch is on', async () => {
    const commercePaymentRepository = repository();
    const partnerClient = { prepareBookingGroup: jest.fn(async () => ({ reservation: { id: 'booking-kilo', quotedAmountCentavos: null, inventoryReservationIds: ['reservation-kilo'] } })) };
    const useCase = buildCreateDglaundryBookingPaymentSessionUseCase({ commercePaymentRepository, paymongoService: {}, partnerClient });
    const result = await useCase({ payload: payload({ mode: 'per_kilo', lines: [{ variantId: 'kilo-1', quantity: 1, externalLineReference: 'line-kilo' }] }) });
    expect(result.success).toBe(true);
    expect(result.data.payment_required).toBe(false);
    expect(commercePaymentRepository.createSession).toHaveBeenCalledWith(expect.objectContaining({ target_type: 'dglaundry_booking', total_amount_centavos: 0 }));
    process.env.DGLAUNDRY_BOOKING_PAYMENTS_KILL_SWITCH = 'true';
    const disabled = await useCase({ payload: payload({ idempotency_key: 'booking-key-2' }) });
    expect(disabled.success).toBe(false);
    expect(disabled.error.code).toBe('SERVICE_UNAVAILABLE');
  });
});
