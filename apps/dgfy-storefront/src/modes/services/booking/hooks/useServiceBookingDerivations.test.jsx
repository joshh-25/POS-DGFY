// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useServiceBookingDerivations } from './useServiceBookingDerivations.js';

const buildProps = (overrides = {}) => ({
  customerAddress: '',
  customerEmail: 'guest@example.com',
  customerName: 'Guest Customer',
  customerPhone: '09171234567',
  customerPin: null,
  hasServiceCart: false,
  money: (value) => String(value),
  resolvedDeliveryAddress: '',
  selectedServiceCartLineId: null,
  selectedServiceDetail: null,
  serviceAppointmentAt: null,
  serviceCartLines: [],
  serviceCartTotal: 0,
  serviceDraftQuantity: 1,
  serviceIntakeResponses: {},
  serviceLineAddOns: {},
  serviceOrderMethod: 'delivery',
  servicePaymentTiming: 'after_service',
  serviceUnitType: '',
  ...overrides,
});

describe('useServiceBookingDerivations fulfillment gates', () => {
  it('requires a location and schedule for delivery services', () => {
    const { result } = renderHook(() => useServiceBookingDerivations(buildProps()));

    expect(result.current.missingScheduleAndServiceInfo).toEqual([
      'Service Location',
      'Preferred Date',
      'Preferred Time Slot',
    ]);
    expect(result.current.fulfillmentStepComplete).toBe(false);
  });

  it('allows pickup after the required schedule is selected', () => {
    const { result } = renderHook(() => useServiceBookingDerivations(buildProps({
      serviceAppointmentAt: '2026-08-10T09:00:00',
      serviceOrderMethod: 'pickup',
    })));

    expect(result.current.missingScheduleAndServiceInfo).toEqual([]);
    expect(result.current.fulfillmentStepComplete).toBe(true);
  });
});
