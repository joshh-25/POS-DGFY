import { describe, expect, it } from 'vitest';

import { serviceTrackingAdapter } from './serviceTrackingAdapter.js';

describe('serviceTrackingAdapter', () => {
  it('derives the shipped appointment profile from service_area_type without a payload profile key', () => {
    const normalized = serviceTrackingAdapter.normalize({
      booking: {
        public_reference: 'SV-APPOINTMENT-1',
        service_area_type: 'in_store',
        service_name: 'Consultation',
        status: 'requested',
        service: {
          service_area_type: 'in_store'
        }
      }
    });

    expect(normalized.serviceProfileKey).toBe('appointment_at_business');
    expect(normalized.serviceAreaType).toBe('in_store');
  });

  it('preserves every service item in an aggregate tracking payload', () => {
    const normalized = serviceTrackingAdapter.normalize({
      booking: {
        public_reference: 'SV-MULTI-1',
        status: 'requested',
        total_amount: 4750
      },
      items: [
        { amount: 1000, item_id: 101, name: 'Aircon Check-up', qty: 1, unit_of_measure: 'Standard service' },
        { amount: 1200, item_id: 102, name: 'Aircon Cleaning · Split Type', qty: 1, unit_of_measure: 'Standard service' },
        { amount: 1500, item_id: 103, name: 'Aircon Cleaning · Window Type', qty: 1, unit_of_measure: 'Standard service' },
        { amount: 1050, item_id: 104, name: 'Repair Assessment', qty: 1, unit_of_measure: 'Standard service' }
      ]
    });

    expect(normalized.items).toHaveLength(4);
    expect(normalized.items.map((item) => item.name)).toEqual([
      'Aircon Check-up',
      'Aircon Cleaning · Split Type',
      'Aircon Cleaning · Window Type',
      'Repair Assessment'
    ]);
    expect(normalized.items.map((item) => item.amount)).toEqual([1000, 1200, 1500, 1050]);
    expect(normalized.totalAmount).toBe(4750);
  });
});
