import { describe, expect, it } from 'vitest';
import { buildServiceBookingSummaryModel } from '../modes/services/booking/model/serviceBookingSummary.js';

describe('service booking summary schedule', () => {
  it('shows the booking-page schedule when the cart line was added before scheduling', () => {
    const model = buildServiceBookingSummaryModel({
      activeBookingService: null,
      firstServiceLine: { item_id: 3, name: 'Comforter Care', service_schedule_at: '' },
      hasServiceCart: true,
      serviceAppointmentAt: '2026-08-20T11:00',
      serviceCartLines: [{ item_id: 3, name: 'Comforter Care', service_schedule_at: '' }]
    });

    expect(model.serviceBookingSummarySchedule).not.toBe('Schedule needed');
    expect(model.reviewServiceLines[0].rows).toContainEqual(expect.objectContaining({
      label: 'Preferred Schedule',
      value: model.serviceBookingSummarySchedule
    }));
  });

  it('does not expose the raw service-area enum as a customer-facing variant', () => {
    const model = buildServiceBookingSummaryModel({
      activeBookingService: null,
      hasServiceCart: true,
      serviceAppointmentAt: '2026-08-20T11:00',
      serviceCartLines: [{
        item_id: 4,
        name: 'Repair Assessment',
        variantName: '',
        service_detail: { service_area_type: 'customer_location' }
      }],
      serviceOrderMethod: 'on_site'
    });

    expect(model.groupedServiceLineItems[0].variant).toBe('');
    expect(model.reviewServiceLines[0].rows).not.toContainEqual(expect.objectContaining({
      label: 'Service Variant',
      value: 'customer_location'
    }));
  });

  it('marks only services with configured add-ons as expandable', () => {
    const model = buildServiceBookingSummaryModel({
      activeBookingService: null,
      hasServiceCart: true,
      serviceCartLines: [
        { item_id: 5, name: 'Basic Wash', service_option_groups: [] },
        {
          item_id: 6,
          name: 'Premium Wash',
          service_option_groups: [{
            group_id: 9,
            group_type: 'addon',
            options: [{ option_id: 91, name: 'Stain treatment' }]
          }]
        }
      ]
    });

    expect(model.reviewServiceLines.map((line) => line.hasAvailableAddOns)).toEqual([false, true]);
  });
});
