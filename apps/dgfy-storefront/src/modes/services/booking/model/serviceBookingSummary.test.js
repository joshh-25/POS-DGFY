import { describe, expect, it } from 'vitest';

import { buildServiceBookingSummaryModel } from './serviceBookingSummary.js';

describe('service booking summary placeholders', () => {
  it('shows not selected yet for empty schedule and fulfillment values', () => {
    const summary = buildServiceBookingSummaryModel({
      activeBookingService: { item_id: 42, name: 'Laundry service', default_sale_price: 100 },
      firstServiceLine: null,
      hasServiceCart: false,
      serviceAppointmentAt: '',
      serviceCartLines: [],
      serviceDraftQuantity: 1,
      serviceIntakeResponses: {},
      serviceOrderMethod: '',
    });

    expect(summary.serviceBookingSummaryRows).toEqual([
      { label: 'Services', value: 'Laundry service' },
      { label: 'Schedule', value: 'Not selected yet' },
      { label: 'Fulfillment type', value: 'Not selected yet' },
    ]);
  });
});
