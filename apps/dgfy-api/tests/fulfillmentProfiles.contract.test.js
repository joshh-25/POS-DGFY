import {
    FULFILLMENT_PROFILES,
    FULFILLMENT_PROFILE_KEYS,
    SHIPPED_FULFILLMENT_PROFILE_KEYS,
    PLANNED_FULFILLMENT_PROFILE_KEYS,
    FULFILLMENT_FINAL_ACTIONS,
    FULFILLMENT_CHECKOUT_FIELD_KEYS,
    FULFILLMENT_FIELD_REQUIREMENTS,
    resolveFulfillmentProfile,
    resolveFulfillmentProfilesForServiceAreaType,
    describeFulfillmentProfile
} from '../src/modules/shared/constants/fulfillmentProfiles.js';
import { CAPABILITY_MODULES } from '../src/modules/shared/constants/capabilityModules.js';
import { SERVICE_AREA_TYPES, BOOKING_STATUSES } from '../src/validators/serviceValidator.js';

// issue #178 follow-up, ADR 0057: pins the services fulfillment-profile
// vocabulary against the real service_area_type/booking-status enums and
// the Capability Module catalog so the three can never silently drift
// apart, and pins the shipped/planned partition as a checked fact rather
// than an incidental property.
describe('fulfillment profile catalog contracts', () => {
    it('gives every profile a service_area_types list drawn only from the real SERVICE_AREA_TYPES enum', () => {
        for (const key of FULFILLMENT_PROFILE_KEYS) {
            const entry = FULFILLMENT_PROFILES[key];
            for (const areaType of entry.service_area_types) {
                expect(SERVICE_AREA_TYPES).toContain(areaType);
            }
        }
    });

    it('covers every SERVICE_AREA_TYPES value with exactly one shipped profile', () => {
        for (const areaType of SERVICE_AREA_TYPES) {
            const matches = FULFILLMENT_PROFILE_KEYS.filter((key) => (
                FULFILLMENT_PROFILES[key].service_area_types.includes(areaType)
            ));
            expect(matches).toHaveLength(1);
            expect(FULFILLMENT_PROFILES[matches[0]].status).toBe('shipped');
        }
    });

    it('pins the current shipped/planned partition (4 shipped, 4 planned)', () => {
        expect([...SHIPPED_FULFILLMENT_PROFILE_KEYS].sort()).toEqual([
            'appointment_at_business',
            'customer_choice_of_location',
            'online_service',
            'service_at_customer_address'
        ]);
        expect([...PLANNED_FULFILLMENT_PROFILE_KEYS].sort()).toEqual([
            'item_dropoff_collection',
            'item_pickup_collection',
            'item_pickup_return',
            'quote_request'
        ]);
    });

    it('gives every shipped profile at least one service_area_types entry, and every planned profile none', () => {
        for (const key of SHIPPED_FULFILLMENT_PROFILE_KEYS) {
            expect(FULFILLMENT_PROFILES[key].service_area_types.length).toBeGreaterThan(0);
        }
        for (const key of PLANNED_FULFILLMENT_PROFILE_KEYS) {
            expect(FULFILLMENT_PROFILES[key].service_area_types).toEqual([]);
        }
    });

    it('points every non-null planned_module at a real, status:planned Capability Module', () => {
        for (const key of FULFILLMENT_PROFILE_KEYS) {
            const entry = FULFILLMENT_PROFILES[key];
            if (entry.planned_module === null) continue;
            const module = CAPABILITY_MODULES[entry.planned_module];
            expect(module).toBeDefined();
            expect(module.status).toBe('planned');
        }
    });

    it('draws final_action only from the closed FULFILLMENT_FINAL_ACTIONS vocabulary', () => {
        for (const key of FULFILLMENT_PROFILE_KEYS) {
            expect(FULFILLMENT_FINAL_ACTIONS).toContain(FULFILLMENT_PROFILES[key].final_action);
        }
    });

    it('draws every checkout_fields key/value from the closed field-key and requirement vocabularies', () => {
        for (const key of FULFILLMENT_PROFILE_KEYS) {
            const fields = FULFILLMENT_PROFILES[key].checkout_fields;
            for (const [fieldKey, requirement] of Object.entries(fields)) {
                expect(FULFILLMENT_CHECKOUT_FIELD_KEYS).toContain(fieldKey);
                expect(FULFILLMENT_FIELD_REQUIREMENTS).toContain(requirement);
            }
            // Every profile positions every known field explicitly - no
            // implicit "unset means hidden" ambiguity for a caller to guess at.
            expect(Object.keys(fields).sort()).toEqual([...FULFILLMENT_CHECKOUT_FIELD_KEYS].sort());
        }
    });

    it("maps every shipped profile's tracking_events onto the real BOOKING_STATUSES enum", () => {
        for (const key of SHIPPED_FULFILLMENT_PROFILE_KEYS) {
            for (const event of FULFILLMENT_PROFILES[key].tracking_events) {
                expect(BOOKING_STATUSES).toContain(event);
            }
        }
    });

    it("does not require a planned profile's tracking_events to map onto BOOKING_STATUSES (declarative-only preview)", () => {
        // Planned profiles (e.g. the pickup/return round trip) declare a
        // richer timeline than the current 7-value BOOKING_STATUSES enum
        // can express - that's the point (ADR 0057 clause 2: planned means
        // "not backed yet", not "must already fit the current schema").
        const pickupReturn = FULFILLMENT_PROFILES.item_pickup_return;
        expect(pickupReturn.tracking_events).toContain('out_for_return');
        expect(BOOKING_STATUSES).not.toContain('out_for_return');
    });

    it('gives every planned profile a non-empty notes field explaining the blocker', () => {
        for (const key of PLANNED_FULFILLMENT_PROFILE_KEYS) {
            expect(typeof FULFILLMENT_PROFILES[key].notes).toBe('string');
            expect(FULFILLMENT_PROFILES[key].notes.length).toBeGreaterThan(0);
        }
    });

    it('orders profiles with unique, contiguous 1-based order values', () => {
        const orders = FULFILLMENT_PROFILE_KEYS.map((key) => FULFILLMENT_PROFILES[key].order).sort((a, b) => a - b);
        expect(orders).toEqual(Array.from({ length: orders.length }, (_, i) => i + 1));
    });

    it('resolveFulfillmentProfile returns null for an unknown key and tolerates surrounding whitespace', () => {
        expect(resolveFulfillmentProfile('not_a_real_profile')).toBeNull();
        expect(resolveFulfillmentProfile(null)).toBeNull();
        expect(resolveFulfillmentProfile('  appointment_at_business  ')).toEqual(FULFILLMENT_PROFILES.appointment_at_business);
    });

    it('resolveFulfillmentProfilesForServiceAreaType resolves each real service_area_type to its one shipped profile', () => {
        expect(resolveFulfillmentProfilesForServiceAreaType('in_store')).toEqual(['appointment_at_business']);
        expect(resolveFulfillmentProfilesForServiceAreaType('customer_location')).toEqual(['service_at_customer_address']);
        expect(resolveFulfillmentProfilesForServiceAreaType('online')).toEqual(['online_service']);
        expect(resolveFulfillmentProfilesForServiceAreaType('hybrid')).toEqual(['customer_choice_of_location']);
        expect(resolveFulfillmentProfilesForServiceAreaType('bogus')).toEqual([]);
        expect(resolveFulfillmentProfilesForServiceAreaType(null)).toEqual([]);
    });

    it('describeFulfillmentProfile joins the planned Capability Module label without drifting from CAPABILITY_MODULES', () => {
        const described = describeFulfillmentProfile('item_pickup_return');
        expect(described.planned_module).toBe('pickupReturnLogistics');
        expect(described.planned_module_label).toBe(CAPABILITY_MODULES.pickupReturnLogistics.label);

        const shipped = describeFulfillmentProfile('appointment_at_business');
        expect(shipped.planned_module).toBeNull();
        expect(shipped.planned_module_label).toBeNull();

        expect(describeFulfillmentProfile('bogus_key')).toBeNull();
    });
});
