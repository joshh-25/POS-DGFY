import { describe, expect, it } from 'vitest';
import { buildServiceCartValidationIssues } from '../modes/services/booking/model/serviceBookingValidation.js';

const unscheduledLine = {
  item_id: 10,
  cart_line_id: 'service-line-10',
  name: 'Comforter Care',
  category: 'service',
  service_schedule_at: '',
  service_detail: null
};

describe('service booking cart validation', () => {
  it('accepts the schedule selected on the booking page for an unscheduled cart line', () => {
    expect(buildServiceCartValidationIssues(
      [unscheduledLine],
      '2026-08-20T11:00'
    )).toEqual([]);
  });

  it('still reports a missing schedule when neither source has one', () => {
    expect(buildServiceCartValidationIssues([unscheduledLine])).toEqual([
      expect.objectContaining({
        cart_line_id: 'service-line-10',
        field: 'Preferred schedule',
        message: 'Comforter Care: choose a preferred appointment date and time.'
      })
    ]);
  });
});
