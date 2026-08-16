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
    describeFulfillmentProfile,
    HANDOFF_PROFILE_BY_LEG_SHAPE,
    deriveFulfillmentProfileFromHandoffLegs,
    resolveFulfillmentTrackingTimeline,
    FULFILLMENT_TRACKING_EVENT_LABELS
} from '../src/modules/shared/constants/fulfillmentProfiles.js';
import { CAPABILITY_MODULES } from '../src/modules/shared/constants/capabilityModules.js';
import { SERVICE_AREA_TYPES, BOOKING_STATUSES, HANDOFF_METHODS_BY_DIRECTION } from '../src/validators/serviceValidator.js';

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

    it('covers every shipped-reachable SERVICE_AREA_TYPES value with exactly one shipped profile', () => {
        // 'item_handoff' (Phase 88 of #482, ADR 0064 decision 7) is the one deliberate exception:
        // it maps onto two still-planned profiles at once (the customer picks the variant at
        // checkout), not one shipped profile - see the dedicated test below.
        for (const areaType of SERVICE_AREA_TYPES) {
            if (areaType === 'item_handoff') continue;
            const matches = FULFILLMENT_PROFILE_KEYS.filter((key) => (
                FULFILLMENT_PROFILES[key].service_area_types.includes(areaType)
            ));
            expect(matches).toHaveLength(1);
            expect(FULFILLMENT_PROFILES[matches[0]].status).toBe('shipped');
        }
    });

    it("maps 'item_handoff' onto exactly item_pickup_return and item_pickup_collection, both still planned", () => {
        const matches = FULFILLMENT_PROFILE_KEYS.filter((key) => (
            FULFILLMENT_PROFILES[key].service_area_types.includes('item_handoff')
        ));
        expect([...matches].sort()).toEqual(['item_pickup_collection', 'item_pickup_return']);
        for (const key of matches) {
            expect(FULFILLMENT_PROFILES[key].status).toBe('planned');
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

    it('gives every shipped profile at least one service_area_types entry, and every unauthorized planned profile none', () => {
        // item_pickup_return and item_pickup_collection are the deliberate exception, populated by
        // Phase 88 of #482 (ADR 0064 decision 7) precisely so they stop being unreachable by
        // construction. item_dropoff_collection and quote_request remain untouched - ADR 0064
        // authorizes nothing for them (decision 1).
        const HANDOFF_AUTHORIZED_PLANNED_PROFILES = Object.freeze(['item_pickup_collection', 'item_pickup_return']);
        for (const key of SHIPPED_FULFILLMENT_PROFILE_KEYS) {
            expect(FULFILLMENT_PROFILES[key].service_area_types.length).toBeGreaterThan(0);
        }
        for (const key of PLANNED_FULFILLMENT_PROFILE_KEYS) {
            if (HANDOFF_AUTHORIZED_PLANNED_PROFILES.includes(key)) {
                expect(FULFILLMENT_PROFILES[key].service_area_types).toEqual(['item_handoff']);
            } else {
                expect(FULFILLMENT_PROFILES[key].service_area_types).toEqual([]);
            }
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
        // Planned profiles generally declare a richer timeline than BOOKING_STATUSES can express -
        // that's the point (ADR 0057 clause 2: planned means "not backed yet", not "must already
        // fit the current schema"). item_pickup_return is no longer an example of this specific
        // gap: Phase 88 of #482 (ADR 0064 decision 4) widened BOOKING_STATUSES to include its full
        // tracking_events timeline - the enum caught up, even though the profile itself is still
        // 'planned' (nothing writes these statuses yet; that's Phase 100). quote_request remains an
        // untouched example of the general point.
        const pickupReturn = FULFILLMENT_PROFILES.item_pickup_return;
        expect(pickupReturn.tracking_events).toContain('out_for_return');
        expect(BOOKING_STATUSES).toContain('out_for_return');

        const quoteRequest = FULFILLMENT_PROFILES.quote_request;
        expect(quoteRequest.tracking_events).toContain('quoted');
        expect(BOOKING_STATUSES).not.toContain('quoted');
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

    it('resolveFulfillmentProfilesForServiceAreaType resolves each real service_area_type to its shipped profile(s)', () => {
        expect(resolveFulfillmentProfilesForServiceAreaType('in_store')).toEqual(['appointment_at_business']);
        expect(resolveFulfillmentProfilesForServiceAreaType('customer_location')).toEqual(['service_at_customer_address']);
        expect(resolveFulfillmentProfilesForServiceAreaType('online')).toEqual(['online_service']);
        expect(resolveFulfillmentProfilesForServiceAreaType('hybrid')).toEqual(['customer_choice_of_location']);
        // 'item_handoff' (Phase 88 of #482) is the one value that resolves to more than one
        // profile - the function's own docblock says "only ever resolves to shipped profiles"
        // because service_area_type was itself always shipped before; that assumption no longer
        // holds for this one value, on purpose, per ADR 0064 decision 7.
        expect([...resolveFulfillmentProfilesForServiceAreaType('item_handoff')].sort()).toEqual([
            'item_pickup_collection', 'item_pickup_return'
        ]);
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

    // Phase 100 of #482 (ADR 0064 decisions 1 and 3): the handoff-leg -> fulfillment-profile
    // derivation. No fulfillment-profile key ever reaches the wire or the database - this is the
    // one place server-side code is allowed to name one, and only from the legs' own shape.
    describe('handoff-leg derivation (ADR 0064)', () => {
        it('derives item_pickup_return from (business_pickup, business_delivery)', () => {
            expect(deriveFulfillmentProfileFromHandoffLegs([
                { direction: 'inbound', method: 'business_pickup' },
                { direction: 'outbound', method: 'business_delivery' }
            ])).toBe('item_pickup_return');
        });

        it('derives item_pickup_collection from (business_pickup, customer_collection)', () => {
            expect(deriveFulfillmentProfileFromHandoffLegs([
                { direction: 'inbound', method: 'business_pickup' },
                { direction: 'outbound', method: 'customer_collection' }
            ])).toBe('item_pickup_collection');
        });

        it('accepts legs in either array order', () => {
            expect(deriveFulfillmentProfileFromHandoffLegs([
                { direction: 'outbound', method: 'business_delivery' },
                { direction: 'inbound', method: 'business_pickup' }
            ])).toBe('item_pickup_return');
        });

        it('returns null for the item_dropoff_collection shape (customer_dropoff is unauthorized)', () => {
            expect(deriveFulfillmentProfileFromHandoffLegs([
                { direction: 'inbound', method: 'customer_dropoff' },
                { direction: 'outbound', method: 'customer_collection' }
            ])).toBeNull();
        });

        it('returns null for every other malformed or unauthorized shape', () => {
            expect(deriveFulfillmentProfileFromHandoffLegs([])).toBeNull();
            expect(deriveFulfillmentProfileFromHandoffLegs(null)).toBeNull();
            expect(deriveFulfillmentProfileFromHandoffLegs([{ direction: 'inbound', method: 'business_pickup' }])).toBeNull();
            expect(deriveFulfillmentProfileFromHandoffLegs([
                { direction: 'inbound', method: 'business_pickup' },
                { direction: 'inbound', method: 'business_pickup' }
            ])).toBeNull();
            expect(deriveFulfillmentProfileFromHandoffLegs([
                { direction: 'outbound', method: 'business_delivery' },
                { direction: 'outbound', method: 'customer_collection' }
            ])).toBeNull();
        });

        // The validator (serviceValidator.js) deliberately does not import
        // HANDOFF_PROFILE_BY_LEG_SHAPE from shared-constants, so its own direction->method
        // whitelist could in principle drift from the derivation map. This test is the guard:
        // the validator's cross-product of accepted (direction, method) pairs must equal exactly
        // this map's key set.
        it("pins the validator's HANDOFF_METHODS_BY_DIRECTION cross-product to HANDOFF_PROFILE_BY_LEG_SHAPE's keys", () => {
            const crossProduct = [];
            for (const inboundMethod of HANDOFF_METHODS_BY_DIRECTION.inbound) {
                for (const outboundMethod of HANDOFF_METHODS_BY_DIRECTION.outbound) {
                    crossProduct.push(`${inboundMethod}|${outboundMethod}`);
                }
            }
            expect(crossProduct.sort()).toEqual(Object.keys(HANDOFF_PROFILE_BY_LEG_SHAPE).sort());
        });

        it('resolveFulfillmentTrackingTimeline returns the six-stage timeline for each authorized variant, differing at stage 5 only', () => {
            const pickupReturn = resolveFulfillmentTrackingTimeline('item_pickup_return');
            const pickupCollection = resolveFulfillmentTrackingTimeline('item_pickup_collection');
            expect(pickupReturn).toEqual(['requested', 'for_pickup', 'pickup_completed', 'in_service', 'out_for_return', 'completed']);
            expect(pickupCollection).toEqual(['requested', 'for_pickup', 'pickup_completed', 'in_service', 'ready_for_collection', 'completed']);
            // Same length, same everywhere except index 4 (the fifth stage).
            expect(pickupReturn).toHaveLength(pickupCollection.length);
            pickupReturn.forEach((stage, index) => {
                if (index === 4) {
                    expect(stage).not.toBe(pickupCollection[index]);
                } else {
                    expect(stage).toBe(pickupCollection[index]);
                }
            });
        });

        it('resolveFulfillmentTrackingTimeline returns an empty array for an unknown or non-handoff profile', () => {
            expect(resolveFulfillmentTrackingTimeline('bogus')).toEqual([]);
            expect(resolveFulfillmentTrackingTimeline(null)).toEqual([]);
        });

        it('gives every tracking_events key across both authorized variants a label', () => {
            const keys = new Set([
                ...resolveFulfillmentTrackingTimeline('item_pickup_return'),
                ...resolveFulfillmentTrackingTimeline('item_pickup_collection')
            ]);
            for (const key of keys) {
                expect(typeof FULFILLMENT_TRACKING_EVENT_LABELS[key]).toBe('string');
                expect(FULFILLMENT_TRACKING_EVENT_LABELS[key].length).toBeGreaterThan(0);
            }
        });
    });

    // ADR 0064 decision 6: pickupReturnLogistics flips to 'shipped' only once the module's
    // behavior exists end-to-end (through Phase 103), not at Phase 100. Regression test so a
    // future Phase 100-scoped change can't accidentally flip it early.
    it('keeps pickupReturnLogistics and both handoff profiles planned after Phase 100 (ADR 0064 decision 6)', () => {
        expect(CAPABILITY_MODULES.pickupReturnLogistics.status).toBe('planned');
        expect(FULFILLMENT_PROFILES.item_pickup_return.status).toBe('planned');
        expect(FULFILLMENT_PROFILES.item_pickup_collection.status).toBe('planned');
    });
});
