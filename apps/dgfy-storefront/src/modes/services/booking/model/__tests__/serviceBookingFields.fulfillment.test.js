/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { buildServiceBookingFieldPlan } from '../serviceBookingFields.js';

// issue #178 follow-up, ADR 0057: buildServiceBookingFieldPlan's
// `requiresAddress` now derives from the real service_area_type enum via
// the fulfillment-profile vocabulary when it resolves, falling back to the
// pre-existing label-substring heuristic only when service_area_type is
// missing/unrecognized. These pin both directions: the new deterministic
// path for all four real service_area_type values, and the fallback
// staying byte-identical when only a label is available.
describe('buildServiceBookingFieldPlan — fulfillment-profile-derived requiresAddress', () => {
  const planFor = (serviceItem) => buildServiceBookingFieldPlan({ fields: [], serviceItem });

  it('requires an address for customer_location (service_at_customer_address profile)', () => {
    const plan = planFor({ service_detail: { service_area_type: 'customer_location' } });
    expect(plan.requiresAddress).toBe(true);
  });

  it('does not require an address for in_store (appointment_at_business profile)', () => {
    const plan = planFor({ service_detail: { service_area_type: 'in_store' } });
    expect(plan.requiresAddress).toBe(false);
  });

  it('does not require an address for online (online_service profile)', () => {
    const plan = planFor({ service_detail: { service_area_type: 'online' } });
    expect(plan.requiresAddress).toBe(false);
  });

  it('requires an address for hybrid (customer_choice_of_location profile) — the case the label heuristic alone gets wrong', () => {
    // The raw enum string "hybrid" matches none of the old heuristic's
    // substring tokens (home / on site / onsite / customer location), so
    // without the fulfillment-profile resolution this would silently
    // resolve to false when no human-readable serviceAreaLabel is present
    // (e.g. a bare cart-line snapshot). The fulfillment profile's
    // checkout_fields.customer_address ('optional', not 'hidden') is what
    // makes this true — deterministic, not string luck.
    const plan = planFor({ service_detail: { service_area_type: 'hybrid' } });
    expect(plan.requiresAddress).toBe(true);
  });

  it('falls back to the label heuristic when service_area_type is missing but serviceAreaLabel implies on-site', () => {
    const plan = planFor({ serviceAreaLabel: 'Home / on-site visit' });
    expect(plan.requiresAddress).toBe(true);
  });

  it('falls back to the label heuristic when service_area_type is unrecognized', () => {
    const plan = planFor({ service_detail: { service_area_type: 'not_a_real_area_type' }, serviceAreaLabel: 'Home visit' });
    expect(plan.requiresAddress).toBe(true);
  });

  it('does not require an address when neither service_area_type nor serviceAreaLabel implies on-site', () => {
    const plan = planFor({ serviceAreaLabel: 'Iloilo City' });
    expect(plan.requiresAddress).toBe(false);
  });

  it('does not require an address when serviceItem is entirely absent', () => {
    const plan = planFor(undefined);
    expect(plan.requiresAddress).toBe(false);
  });

  it('still requires an address whenever an explicit address field is present, regardless of area type', () => {
    const plan = buildServiceBookingFieldPlan({
      fields: [{ id: 'address', label: 'Service Address', type: 'text', required: false, options: [] }],
      serviceItem: { service_detail: { service_area_type: 'in_store' } }
    });
    expect(plan.addressField).toBeTruthy();
    expect(plan.requiresAddress).toBe(true);
  });

  it('keeps service-specific unit fields in the generic configured intake list', () => {
    const plan = buildServiceBookingFieldPlan({
      fields: [{ id: 'equipment_model', label: 'Equipment model', type: 'select', required: false, options: ['Standard'] }],
      serviceItem: { service_detail: { service_area_type: 'customer_location' } }
    });

    expect(plan.unitTypeField).toBeNull();
    expect(plan.remainingFields).toEqual([
      { id: 'equipment_model', label: 'Equipment model', type: 'select', required: false, options: ['Standard'] }
    ]);
  });
});
