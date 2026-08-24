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
});
