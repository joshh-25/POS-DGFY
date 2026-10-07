import { jest } from '@jest/globals';
import { buildCreateDglaundryBookingPaymentSessionUseCase } from '../src/modules/commercePayments/usecases/createDglaundryBookingPaymentSessionUseCase.js';

const payload = (overrides = {}) => ({
  tenant_id: 'company-a',
  company_id: 'company-a',
  location_id: 'location-a',
  mode: 'mixed',
  external_order_reference: 'order-1',
  external_tracking_reference: 'track-1',
  idempotency_key: 'booking-key-12345678',
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
const mappingRepository = () => ({ findActiveMapping: jest.fn(async () => ({ id: 'mapping-1', status: 'active' })) });

describe('DGLaundry booking payment session', () => {
  const previous = process.env.DGLAUNDRY_BOOKING_PAYMENTS_ENABLED;
  beforeEach(() => { process.env.DGLAUNDRY_BOOKING_PAYMENTS_ENABLED = 'true'; delete process.env.DGLAUNDRY_BOOKING_PAYMENTS_KILL_SWITCH; delete process.env.DGLAUNDRY_BOOKING_PAYMENTS_DISABLED_BRANCHES; });
  afterAll(() => { if (previous === undefined) delete process.env.DGLAUNDRY_BOOKING_PAYMENTS_ENABLED; else process.env.DGLAUNDRY_BOOKING_PAYMENTS_ENABLED = previous; });

  it('keeps fixed-price payment dark-disabled when the feature flag is off', async () => {
    process.env.DGLAUNDRY_BOOKING_PAYMENTS_ENABLED = 'false';
    const commercePaymentRepository = repository();
    const partnerClient = { prepareBookingGroup: jest.fn() };
    const useCase = buildCreateDglaundryBookingPaymentSessionUseCase({
      commercePaymentRepository,
      paymongoService: { createQrphPaymentIntent: jest.fn() },
      partnerClient,
      mappingRepository: mappingRepository()
    });

    const result = await useCase({ payload: payload({ mode: 'fixed', idempotency_key: 'booking-key-dark-123456' }) });

    expect(result.success).toBe(false);
    expect(result.error).toMatchObject({ code: 'SERVICE_UNAVAILABLE', statusCode: 503 });
    expect(partnerClient.prepareBookingGroup).not.toHaveBeenCalled();
    expect(commercePaymentRepository.createSession).not.toHaveBeenCalled();
  });

  it('prepares mixed fixed/per-kilo children and charges only the fixed child', async () => {
    const commercePaymentRepository = repository();
    const partnerClient = { prepareBookingGroup: jest.fn(async (request) => ({ reservation: { id: `booking-${request.mode}`, quotedAmountCentavos: request.mode === 'fixed' ? 12500 : null, inventoryReservationIds: [`reservation-${request.mode}`] } })) };
    const paymongoService = { createQrphPaymentIntent: jest.fn(async () => ({ paymentIntent: { id: 'pi_1' }, paymentMethod: { id: 'pm_1' }, qrCodeImageUrl: 'https://paymongo.test/qr', expiresAt: new Date(Date.now() + 60000).toISOString() })) };
    const activeMappings = mappingRepository();
    const useCase = buildCreateDglaundryBookingPaymentSessionUseCase({ commercePaymentRepository, paymongoService, partnerClient, mappingRepository: activeMappings });
    const result = await useCase({ payload: payload() });
    expect(result.success).toBe(true);
    expect(result.data.payment_required).toBe(true);
    expect(partnerClient.prepareBookingGroup).toHaveBeenCalledTimes(2);
    expect(activeMappings.findActiveMapping).toHaveBeenCalledWith({ companyId: 'company-a', locationId: 'location-a' });
    expect(paymongoService.createQrphPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({ amount: 12500, splitPayment: null }));
    expect(commercePaymentRepository.createSession).toHaveBeenCalledWith(expect.objectContaining({ target_type: 'dglaundry_booking', platform_fee_centavos: 0 }));
    const persisted = commercePaymentRepository.createSession.mock.calls.find(([session]) => session.target_type === 'dglaundry_booking')[0];
    expect(persisted.public_reference).toMatch(/^DGL-[A-F0-9]{48}$/);
    expect(persisted.public_reference).not.toBe('order-1');
    expect(persisted.checkout_payload.dglaundry_booking_group.children.every((child) => child.externalOrderReference !== 'order-1')).toBe(true);
  });

  it('returns a reservation-only result for per-kilo and stays dark when the kill switch is on', async () => {
    const commercePaymentRepository = repository();
    const partnerClient = { prepareBookingGroup: jest.fn(async () => ({ reservation: { id: 'booking-kilo', quotedAmountCentavos: null, inventoryReservationIds: ['reservation-kilo'] } })) };
    const useCase = buildCreateDglaundryBookingPaymentSessionUseCase({ commercePaymentRepository, paymongoService: {}, partnerClient, mappingRepository: mappingRepository() });
    const result = await useCase({ payload: payload({ mode: 'per_kilo', lines: [{ variantId: 'kilo-1', quantity: 1, externalLineReference: 'line-kilo' }] }) });
    expect(result.success).toBe(true);
    expect(result.data.payment_required).toBe(false);
    expect(commercePaymentRepository.createSession).toHaveBeenCalledWith(expect.objectContaining({ target_type: 'dglaundry_booking', total_amount_centavos: 0 }));
    process.env.DGLAUNDRY_BOOKING_PAYMENTS_KILL_SWITCH = 'true';
    const disabled = await useCase({ payload: payload({ idempotency_key: 'booking-key-22345678' }) });
    expect(disabled.success).toBe(false);
    expect(disabled.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('does not create a reservation or payment for a company/location without an active mapping', async () => {
    const commercePaymentRepository = repository();
    const partnerClient = { prepareBookingGroup: jest.fn() };
    const paymongoService = { createQrphPaymentIntent: jest.fn() };
    const mappings = { findActiveMapping: jest.fn(async () => null) };
    const useCase = buildCreateDglaundryBookingPaymentSessionUseCase({ commercePaymentRepository, paymongoService, partnerClient, mappingRepository: mappings });
    const result = await useCase({ payload: payload() });
    expect(result.success).toBe(false);
    expect(result.error).toMatchObject({ code: 'AUTHORIZATION_FAILED', statusCode: 403 });
    expect(commercePaymentRepository.findSessionByIdempotency).not.toHaveBeenCalled();
    expect(partnerClient.prepareBookingGroup).not.toHaveBeenCalled();
    expect(paymongoService.createQrphPaymentIntent).not.toHaveBeenCalled();
  });
});
