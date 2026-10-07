import { jest } from '@jest/globals';
import { cancelDglaundryBookingReservations, notifyDglaundryBookingRefund, reconcileDeliveredDglaundryBooking, submitPaidDglaundryBooking } from '../src/modules/commercePayments/usecases/finalizeDglaundryBookingSession.js';

const session = {
  session_id: 7,
  public_reference: 'DGL-1',
  target_type: 'dglaundry_booking',
  status: 'paid',
  total_amount_centavos: 12500,
  checkout_payload: {
    company_id: 'company-a',
    location_id: 'location-a',
    external_order_reference: 'order-1',
    external_tracking_reference: 'track-1',
    fulfillment: { mode: 'pickup' },
    dglaundry_booking_group: { mode: 'fixed', children: [{ mode: 'fixed', companyId: 'company-a', locationId: 'location-a', externalOrderReference: 'order-1', externalTrackingReference: 'track-1', reservationIds: ['reservation-1'], lines: [{ externalLineReference: 'line-1', serviceName: 'Wash', quantity: 1 }] }] },
    dglaundry_submission: { companyId: 'company-a', locationId: 'location-a', externalOrderReference: 'order-1', externalTrackingReference: 'track-1', reservationIds: ['reservation-1'], lines: [{ externalLineReference: 'line-1', serviceName: 'Wash', quantity: 1 }] }
  }
};

describe('DGLaundry payment lifecycle bridge', () => {
  it('submits one paid event and finalizes the landlord payment session', async () => {
    const partnerClient = { submitOrder: jest.fn(async () => ({ accepted: true })), completeCallerReconciliation: jest.fn(async () => {}) };
    const commercePaymentRepository = { updateSessionById: jest.fn(async (_id, patch) => ({ ...session, ...patch })) };
    const result = await submitPaidDglaundryBooking({ session, resource: { id: 'pay_1' }, providerEventId: 'pm-event-1', commercePaymentRepository, partnerClient });
    expect(partnerClient.submitOrder).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'dgfy.laundry_order.submitted.v1' }),
      expect.objectContaining({ completion: { type: 'paid_dglaundry_booking', reference: '7' } })
    );
    expect(partnerClient.submitOrder.mock.calls[0][0].data.payment).toEqual(expect.objectContaining({ status: 'paid', amountCentavos: 12500 }));
    expect(partnerClient.submitOrder.mock.calls[0][1]).toEqual({ completion: { type: 'paid_dglaundry_booking', reference: '7' } });
    expect(partnerClient.completeCallerReconciliation).toHaveBeenCalledWith(partnerClient.submitOrder.mock.calls[0][0].id);
    expect(result.status).toBe('finalized');
  });

  it('reconciles a previously delivered paid booking locally without resending or repeating payment work', async () => {
    const commercePaymentRepository = { updateSessionById: jest.fn(async (_id, patch) => ({ ...session, ...patch })) };
    const result = await reconcileDeliveredDglaundryBooking({ session, commercePaymentRepository });
    expect(result.status).toBe('finalized');
    expect(commercePaymentRepository.updateSessionById).toHaveBeenCalledWith(7, expect.objectContaining({ status: 'finalized' }));
  });

  it('retries caller finalization after provider acceptance with the same event identity', async () => {
    const partnerClient = { submitOrder: jest.fn(async () => ({ accepted: true })), completeCallerReconciliation: jest.fn(async () => {}) };
    const commercePaymentRepository = {
      updateSessionById: jest.fn()
        .mockRejectedValueOnce(new Error('landlord session update unavailable'))
        .mockResolvedValueOnce({ ...session, status: 'finalized' })
    };
    await expect(submitPaidDglaundryBooking({ session, resource: { id: 'pay_1' }, providerEventId: 'pm-event-retry', commercePaymentRepository, partnerClient }))
      .rejects.toThrow('landlord session update unavailable');
    const result = await submitPaidDglaundryBooking({ session, resource: { id: 'pay_1' }, providerEventId: 'pm-event-retry', commercePaymentRepository, partnerClient });
    expect(result.status).toBe('finalized');
    expect(partnerClient.submitOrder).toHaveBeenCalledTimes(2);
    expect(partnerClient.submitOrder.mock.calls[0][0].id).toBe(partnerClient.submitOrder.mock.calls[1][0].id);
    expect(partnerClient.completeCallerReconciliation).toHaveBeenCalledTimes(1);
  });

  it('submits only the fixed child after a mixed booking is paid', async () => {
    const partnerClient = { submitOrder: jest.fn(async () => ({ accepted: true })) };
    const commercePaymentRepository = { updateSessionById: jest.fn(async (_id, patch) => ({ ...session, ...patch })) };
    const mixedSession = {
      ...session,
      checkout_payload: {
        ...session.checkout_payload,
        dglaundry_booking_group: {
          mode: 'mixed',
          children: [
            { mode: 'fixed', companyId: 'company-a', locationId: 'location-a', externalOrderReference: 'order-1:fixed', externalTrackingReference: 'track-1:fixed', reservationIds: ['reservation-fixed'], lines: [{ externalLineReference: 'line-fixed', serviceName: 'Wash', quantity: 1 }] },
            { mode: 'per_kilo', companyId: 'company-a', locationId: 'location-a', externalOrderReference: 'order-1:per_kilo', externalTrackingReference: 'track-1:per_kilo', reservationIds: ['reservation-kilo'], lines: [{ externalLineReference: 'line-kilo', serviceName: 'Dry', quantity: 1 }] }
          ]
        },
        dglaundry_submission: { mode: 'fixed', companyId: 'company-a', locationId: 'location-a', externalOrderReference: 'order-1:fixed', externalTrackingReference: 'track-1:fixed', reservationIds: ['reservation-fixed'], lines: [{ externalLineReference: 'line-fixed', serviceName: 'Wash', quantity: 1 }] }
      }
    };

    await submitPaidDglaundryBooking({ session: mixedSession, resource: { id: 'pay_1' }, providerEventId: 'pm-mixed-1', commercePaymentRepository, partnerClient });

    expect(partnerClient.submitOrder).toHaveBeenCalledTimes(1);
    expect(partnerClient.submitOrder.mock.calls[0][0].data.orderMode).toBe('fixed');
    expect(partnerClient.submitOrder.mock.calls[0][0].data.externalOrderReference).toBe('order-1:fixed');
  });

  it('cancels all explicit reservations on failure and sends a refund snapshot', async () => {
    const partnerClient = { cancelOrder: jest.fn(async () => ({ accepted: true })), updateOrder: jest.fn(async () => ({ accepted: true })) };
    const commercePaymentRepository = { updateSessionById: jest.fn(async (_id, patch) => ({ ...session, ...patch })) };
    await cancelDglaundryBookingReservations({ session, reason: 'PAYMENT_FAILED', providerEventId: 'pm-event-2', commercePaymentRepository, partnerClient });
    expect(partnerClient.cancelOrder).toHaveBeenCalledTimes(1);
    await notifyDglaundryBookingRefund({ session, refund: { amount_centavos: 12500, public_reference: 'refund-1' }, providerEventId: 'refund-event-1', partnerClient });
    expect(partnerClient.updateOrder).toHaveBeenCalledWith(expect.objectContaining({ type: 'dgfy.laundry_order.payment_status_changed.v1' }));
  });
});
