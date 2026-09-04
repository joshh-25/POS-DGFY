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

  it('still requires the pickup address for pickup-and-collection after the schedule is selected', () => {
    const { result } = renderHook(() => useServiceBookingDerivations(buildProps({
      serviceAppointmentAt: '2026-08-10T09:00:00',
      serviceOrderMethod: 'pickup',
    })));

    expect(result.current.missingScheduleAndServiceInfo).toEqual(['Service Location']);
    expect(result.current.fulfillmentStepComplete).toBe(false);
  });

  it('does not require an appointment schedule for quote requests', () => {
    const { result } = renderHook(() => useServiceBookingDerivations(buildProps({
      serviceOrderMethod: 'quote'
    })));

    expect(result.current.missingScheduleAndServiceInfo).toEqual([]);
    expect(result.current.fulfillmentStepComplete).toBe(true);
  });

  it('keeps the fulfillment summary neutral until a Laundry handoff is selected', () => {
    const { result } = renderHook(() => useServiceBookingDerivations(buildProps({
      selectedServiceDetail: {
        item_id: 3,
        category: 'service',
        service_detail: {
          service_category: 'Bedding',
          service_area_type: 'in_store'
        }
      },
      serviceOrderMethod: '',
      storefrontContext: {
        slug: 'ralph-s-laundry-a5695d',
        tenant_name: "Ralph's Laundry",
        workflow_mode: 'services',
        storefront_categories: ['Laundry']
      }
    })));

    expect(result.current.serviceBookingSummaryRows).toEqual(expect.arrayContaining([
      { label: 'Fulfillment type', value: 'Not selected yet' }
    ]));
  });

  it('keeps the live Laundry storefront on its existing handoff flow', () => {
    const { result } = renderHook(() => useServiceBookingDerivations(buildProps({
      selectedServiceDetail: {
        category: 'service',
        service_detail: {
          service_category: 'Bedding',
          service_area_type: 'in_store'
        }
      },
      serviceOrderMethod: 'pickup',
      storefrontContext: {
        slug: 'ralph-s-laundry-a5695d',
        tenant_name: "Ralph's Laundry",
        workflow_mode: 'services',
        storefront_categories: ['Laundry']
      }
    })));

    expect(result.current.serviceFlow.profileKey).toBe('item_pickup_collection');
    expect(result.current.serviceFlow.requiresAddress).toBe(true);
  });

  it('uses the non-Laundry service profile without auto-selecting fulfillment', () => {
    const { result } = renderHook(() => useServiceBookingDerivations(buildProps({
      isServicesMode: true,
      selectedServiceDetail: {
        item_id: 501,
        category: 'service',
        name: 'Aircon Cleaning',
        service_detail: { service_area_type: 'customer_location' }
      },
      serviceOrderMethod: '',
      storefrontContext: {
        slug: 'ralph-s-ac-solutions-8143ba',
        tenant_name: "Ralph's AC Solutions"
      }
    })));

    expect(result.current.serviceFlowProfileMethod).toBe('on_site');
    expect(result.current.serviceFlowMethod).toBe('on_site');
    expect(result.current.serviceBookingSummaryRows).toEqual(expect.arrayContaining([
      { label: 'Fulfillment type', value: "Service at the customer's address" },
      { label: 'Schedule', value: 'Not selected yet' }
    ]));
    expect(result.current.missingScheduleAndServiceInfo).toEqual([
      'Service Location',
      'Preferred Date',
      'Preferred Time Slot'
    ]);
  });

  it('uses the current catalog schema instead of stale persisted service fields', () => {
    const staleServiceLine = {
      item_id: 501,
      cart_line_id: 'service-line-501',
      service_detail: {
        service_area_type: 'customer_location',
        intake_form_schema: {
          fields: [{ id: 'unit_type', label: 'Aircon unit type', type: 'select', required: false, options: ['Split'] }]
        }
      }
    };
    const { result } = renderHook(() => useServiceBookingDerivations(buildProps({
      hasServiceCart: true,
      serviceOrderMethod: 'on_site',
      selectedServiceCartLineId: 'service-line-501',
      serviceCartLines: [staleServiceLine],
      serviceCatalog: [{
        item_id: 501,
        service_detail: {
          service_area_type: 'customer_location',
          intake_form_schema: { fields: [] }
        }
      }]
    })));

    expect(result.current.bookingPageIntakeFields).toEqual([]);
    expect(result.current.bookingStepOneAdditionalFields).toEqual([]);
  });
});
