import { describe, expect, it } from 'vitest';
import {
  buildSingleServiceBookingPayload,
  buildServiceBookingBatchPayload,
  resolveServicesBookingSubmitContract
} from '../services/servicesBookingContract.js';

const createIdempotencyKey = (prefix) => `${prefix}-fixed`;

const baseLine = (overrides = {}) => ({
  item_id: 10,
  variantName: 'Aircon Cleaning',
  category: 'service',
  quantity: 1,
  service_schedule_at: '2026-08-01T09:00:00.000Z',
  service_notes: '',
  payment_timing: 'postpaid',
  intake_responses: null,
  ...overrides
});

describe('servicesBookingContract (ADR 0016 multiplicity)', () => {
  it('buildSingleServiceBookingPayload includes quantity for resource-backed multi-unit bookings', () => {
    const payload = buildSingleServiceBookingPayload({
      line: baseLine({ quantity: 3, selected_option_ids: [81, 82] }),
      customerName: 'Jane Doe',
      customerEmail: 'jane@example.com',
      customerPhone: '',
      selectedLocationId: 5,
      storeLocationId: null,
      paymentTiming: 'postpaid',
      serviceIntakeResponses: {},
      bookingPageIntakeFields: [],
      customerAddress: '',
      bookingFieldPlan: {},
      createIdempotencyKey
    });

    expect(payload.quantity).toBe(3);
    expect(payload.service_item_id).toBe(10);
    expect(payload.selected_option_ids).toEqual([81, 82]);
  });

  it('resolves a single cart line to the singular booking route with quantity > 1 allowed', () => {
    const contract = resolveServicesBookingSubmitContract({
      hasServiceCart: true,
      serviceCartLines: [baseLine({ quantity: 4 })],
      serviceBookingLine: null,
      customerName: 'Jane Doe',
      customerEmail: 'jane@example.com',
      customerPhone: '',
      selectedLocationId: 5,
      storeLocationId: null,
      paymentTiming: 'postpaid',
      serviceIntakeResponses: {},
      bookingPageIntakeFields: [],
      customerAddress: '',
      bookingFieldPlan: {},
      createIdempotencyKey
    });

    expect(contract.compatible).toBe(true);
    expect(contract.route).toBe('/api/v1/store/services/bookings');
    expect(contract.body.quantity).toBe(4);
  });

  it('uses the booking-page schedule when a single cart line was added before scheduling', () => {
    const contract = resolveServicesBookingSubmitContract({
      hasServiceCart: true,
      serviceCartLines: [baseLine({ service_schedule_at: '' })],
      serviceBookingLine: null,
      customerName: 'Jane Doe',
      customerEmail: 'jane@example.com',
      customerPhone: '',
      selectedLocationId: 5,
      storeLocationId: null,
      paymentTiming: 'postpaid',
      serviceIntakeResponses: {},
      bookingPageIntakeFields: [],
      customerAddress: '',
      bookingFieldPlan: {},
      serviceAppointmentAt: '2026-08-20T11:00',
      createIdempotencyKey
    });

    expect(contract.compatible).toBe(true);
    expect(contract.body.start_at).toBe(new Date('2026-08-20T11:00').toISOString());
  });

  it('resolves multiple cart lines to the batch route instead of blocking multiplicity', () => {
    const lines = [
      baseLine({ item_id: 10, cart_line_id: 'a', quantity: 1 }),
      baseLine({ item_id: 11, cart_line_id: 'b', quantity: 2, service_schedule_at: '2026-08-02T10:00:00.000Z' })
    ];
    const contract = resolveServicesBookingSubmitContract({
      hasServiceCart: true,
      serviceCartLines: lines,
      serviceBookingLine: null,
      customerName: 'Jane Doe',
      customerEmail: 'jane@example.com',
      customerPhone: '',
      selectedLocationId: 5,
      storeLocationId: null,
      paymentTiming: 'postpaid',
      serviceIntakeResponses: {},
      bookingPageIntakeFields: [],
      customerAddress: '',
      bookingFieldPlan: {},
      createIdempotencyKey
    });

    expect(contract.compatible).toBe(true);
    expect(contract.route).toBe('/api/v1/store/services/bookings/batch');
    expect(contract.body.customer_name).toBe('Jane Doe');
    expect(contract.body.bookings).toHaveLength(2);
    expect(contract.body.bookings[0].service_item_id).toBe(10);
    expect(contract.body.bookings[1].service_item_id).toBe(11);
    expect(contract.body.bookings[1].quantity).toBe(2);
  });

  it('buildServiceBookingBatchPayload reads schedule/notes/intake off each line, not shared form state', () => {
    const lines = [
      baseLine({
        item_id: 20,
        service_notes: 'Ring doorbell',
        intake_responses: { color: 'blue' },
        selected_options: [{ option_id: 91, name: 'King size' }]
      })
    ];
    const payload = buildServiceBookingBatchPayload({
      serviceCartLines: lines,
      customerName: 'Jane Doe',
      customerEmail: 'jane@example.com',
      customerPhone: '',
      selectedLocationId: 5,
      storeLocationId: null,
      customerAddress: '',
      bookingFieldPlan: {},
      createIdempotencyKey
    });

    expect(payload.bookings[0].notes).toBe('Ring doorbell');
    expect(payload.bookings[0].intake_responses).toEqual({ color: 'blue' });
    expect(payload.bookings[0].payment_timing).toBe('postpaid');
    expect(payload.bookings[0].selected_option_ids).toEqual([91]);
  });

  it('uses the booking-page schedule for unscheduled lines in a batch', () => {
    const payload = buildServiceBookingBatchPayload({
      serviceCartLines: [
        baseLine({ item_id: 20, service_schedule_at: '' }),
        baseLine({ item_id: 21, service_schedule_at: '' })
      ],
      customerName: 'Jane Doe',
      customerEmail: 'jane@example.com',
      customerPhone: '',
      selectedLocationId: 5,
      storeLocationId: null,
      customerAddress: '',
      bookingFieldPlan: {},
      fallbackScheduleAt: '2026-08-20T11:00',
      createIdempotencyKey
    });

    expect(payload.bookings.map((booking) => booking.start_at)).toEqual([
      new Date('2026-08-20T11:00').toISOString(),
      new Date('2026-08-20T11:00').toISOString()
    ]);
  });

  it('reports incompatible only when there is no service line to submit', () => {
    const contract = resolveServicesBookingSubmitContract({
      hasServiceCart: false,
      serviceCartLines: [],
      serviceBookingLine: null,
      customerName: '',
      customerEmail: '',
      customerPhone: '',
      selectedLocationId: null,
      storeLocationId: null,
      paymentTiming: 'postpaid',
      serviceIntakeResponses: {},
      bookingPageIntakeFields: [],
      customerAddress: '',
      bookingFieldPlan: {},
      createIdempotencyKey
    });

    expect(contract.compatible).toBe(false);
  });
});
