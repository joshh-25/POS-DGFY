import { describe, expect, it } from 'vitest';

import {
  resolveServiceFlowMethod,
  resolveServiceFlowProfileMethod,
  resolveServiceFulfillmentProfile
} from './serviceFulfillmentProfile.js';

describe('service fulfillment profile resolution', () => {
  it('maps customer-location services to the on-site flow', () => {
    const serviceItem = {
      name: 'Aircon Cleaning',
      service_detail: { service_area_type: 'customer_location' }
    };

    expect(resolveServiceFulfillmentProfile({ serviceItem }).label).toBe("Service at the customer's address");
    expect(resolveServiceFlowProfileMethod({ serviceItem, storefrontContext: { slug: 'ralph-s-ac-solutions' } })).toBe('on_site');
    expect(resolveServiceFlowMethod({ serviceItem, storefrontContext: { slug: 'ralph-s-ac-solutions' } })).toBe('on_site');
  });

  it('maps an in-store service to an appointment without auto-selecting the raw method', () => {
    const serviceItem = {
      name: 'Haircut',
      service_detail: { service_area_type: 'in_store' }
    };

    expect(resolveServiceFlowProfileMethod({ serviceItem, storefrontContext: { slug: 'appointment-example' } })).toBe('appointment');
    expect(resolveServiceFlowMethod({ serviceItem, selectedMethod: '', storefrontContext: { slug: 'appointment-example' } })).toBe('appointment');
  });

  it('keeps Laundry on the legacy handoff chooser', () => {
    const serviceItem = {
      name: 'Wash, Dry & Fold',
      service_detail: { service_area_type: 'in_store' }
    };
    const storefrontContext = {
      slug: 'ralph-s-laundry-a5695d',
      tenant_name: "Ralph's Laundry",
      storefront_categories: ['Laundry']
    };

    expect(resolveServiceFlowProfileMethod({ serviceItem, storefrontContext })).toBe('');
    expect(resolveServiceFlowMethod({ serviceItem, selectedMethod: '', storefrontContext })).toBe('');
    expect(resolveServiceFlowMethod({ serviceItem, selectedMethod: 'pickup', storefrontContext })).toBe('pickup');
  });

  it('accepts the alternate serviceDetail API casing', () => {
    const serviceItem = {
      name: 'Online consultation',
      serviceDetail: { service_area_type: 'online' }
    };

    expect(resolveServiceFlowProfileMethod({ serviceItem, storefrontContext: { slug: 'consulting-example' } })).toBe('online');
  });
});
