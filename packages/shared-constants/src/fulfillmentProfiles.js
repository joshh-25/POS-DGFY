/**
 * The service checkout fulfillment-profile vocabulary (issue #178, ADR
 * 0057). Adapted from an externally-authored planning reference ("Services
 * Checkout Flow by Service Type") — codified here as an engineering-owned
 * shared constant, per ADR 0057 clause 1.
 *
 * A fulfillment profile describes HOW a service is delivered to the
 * customer: where it happens, what checkout should ask for, what the
 * final booking action is called, and what the customer-facing tracking
 * timeline looks like. It is deliberately grained per SERVICE ITEM
 * (`ServiceItemDetail.service_area_type`), never per store or per
 * workflow_mode — a single business can legitimately sell both in-store
 * and at-home services at once (ADR 0057 clause 4).
 *
 * `status: 'shipped'` means checkout can complete for that profile today,
 * exactly as currently implemented — any real degradation is named in
 * `notes`, not hidden. `status: 'planned'` means no backend mechanism
 * exists yet; `planned_module` names the Capability Module (if any) that
 * would need to ship first. Per ADR 0057 clause 3, this vocabulary may
 * drive client-side checkout composition only — no booking payload field,
 * database column, or Store Profile section may carry a raw fulfillment
 * profile key.
 */

import { CAPABILITY_MODULES } from './capabilityModules.js';

// Closed vocabulary of the booking flow's final call-to-action label.
export const FULFILLMENT_FINAL_ACTIONS = Object.freeze([
    'confirm_appointment',
    'confirm_booking',
    'send_booking_request',
    'request_a_price'
]);

// Closed vocabulary of checkout fields a fulfillment profile can position.
export const FULFILLMENT_CHECKOUT_FIELD_KEYS = Object.freeze([
    'branch',
    'customer_address',
    'map_pin',
    'date',
    'time',
    'meeting_details',
    'pickup_address',
    'return_address',
    'collection_branch',
    'photos'
]);

// Closed vocabulary of how a checkout field is positioned for a profile.
export const FULFILLMENT_FIELD_REQUIREMENTS = Object.freeze(['required', 'optional', 'hidden']);

const checkoutFields = (spec) => Object.freeze(spec);

export const FULFILLMENT_PROFILES = Object.freeze({
    appointment_at_business: Object.freeze({
        order: 1,
        label: 'Appointment at the business',
        summary: 'The customer visits a branch at a scheduled date and time.',
        status: 'shipped',
        final_action: 'confirm_appointment',
        service_area_types: Object.freeze(['in_store']),
        planned_module: null,
        checkout_fields: checkoutFields({
            branch: 'required',
            date: 'required',
            time: 'required',
            customer_address: 'hidden',
            map_pin: 'hidden',
            meeting_details: 'hidden',
            pickup_address: 'hidden',
            return_address: 'hidden',
            collection_branch: 'hidden',
            photos: 'hidden'
        }),
        tracking_events: Object.freeze(['requested', 'confirmed', 'checked_in', 'in_service', 'completed']),
        notes: 'Good for salons, spas, studios, consultations, and branch tutoring. Maps directly onto service_area_type: in_store.'
    }),
    service_at_customer_address: Object.freeze({
        order: 2,
        label: "Service at the customer's address",
        summary: 'Staff travel to the customer for a scheduled visit.',
        status: 'shipped',
        final_action: 'confirm_booking',
        service_area_types: Object.freeze(['customer_location']),
        planned_module: null,
        checkout_fields: checkoutFields({
            customer_address: 'required',
            map_pin: 'required',
            date: 'required',
            time: 'required',
            branch: 'hidden',
            meeting_details: 'hidden',
            pickup_address: 'hidden',
            return_address: 'hidden',
            collection_branch: 'hidden',
            photos: 'hidden'
        }),
        tracking_events: Object.freeze(['requested', 'confirmed', 'checked_in', 'in_service', 'completed']),
        notes: 'Good for home cleaning, repair visits, and appliance service. Maps directly onto service_area_type: customer_location. '
            + 'Shipped with a known degradation: ServiceBooking has no dedicated customer-address column today - the storefront '
            + 'currently prepends the address into the free-text notes field rather than a first-class field (see '
            + 'docs/features/SERVICES_FULFILLMENT_PROFILES.md).'
    }),
    online_service: Object.freeze({
        order: 3,
        label: 'Online service',
        summary: 'The service happens over a call or online meeting, not at a physical location.',
        status: 'shipped',
        final_action: 'confirm_appointment',
        service_area_types: Object.freeze(['online']),
        planned_module: null,
        checkout_fields: checkoutFields({
            date: 'required',
            time: 'required',
            meeting_details: 'optional',
            branch: 'hidden',
            customer_address: 'hidden',
            map_pin: 'hidden',
            pickup_address: 'hidden',
            return_address: 'hidden',
            collection_branch: 'hidden',
            photos: 'hidden'
        }),
        tracking_events: Object.freeze(['requested', 'confirmed', 'checked_in', 'in_service', 'completed']),
        notes: 'Good for online tutoring, consultations, and coaching. Maps directly onto service_area_type: online. '
            + 'meeting_details is optional, not required: a real joining-link contract is not currently available in the backend.'
    }),
    customer_choice_of_location: Object.freeze({
        order: 4,
        label: 'Customer chooses the location',
        summary: 'The business offers both branch visits and home visits; the customer picks.',
        status: 'shipped',
        final_action: 'confirm_booking',
        service_area_types: Object.freeze(['hybrid']),
        planned_module: null,
        checkout_fields: checkoutFields({
            branch: 'optional',
            customer_address: 'optional',
            map_pin: 'optional',
            date: 'required',
            time: 'required',
            meeting_details: 'hidden',
            pickup_address: 'hidden',
            return_address: 'hidden',
            collection_branch: 'hidden',
            photos: 'hidden'
        }),
        tracking_events: Object.freeze(['requested', 'confirmed', 'checked_in', 'in_service', 'completed']),
        notes: 'Maps directly onto service_area_type: hybrid. Checkout should show only the branch OR the address fields for '
            + "whichever the customer picked, not both at once - that composition choice belongs to the storefront's checkout UI, "
            + 'not this vocabulary.'
    }),
    item_pickup_return: Object.freeze({
        order: 5,
        label: 'Pickup and return to the customer',
        summary: 'The business collects an item and returns it to the customer after the work.',
        status: 'planned',
        final_action: 'send_booking_request',
        // Populated by Phase 88 of #482 (ADR 0064 decision 7): 'item_handoff' is the fifth
        // service_area_type value, added specifically so this profile is reachable via
        // resolveFulfillmentProfilesForServiceAreaType - it was unreachable by construction before.
        service_area_types: Object.freeze(['item_handoff']),
        planned_module: 'pickupReturnLogistics',
        checkout_fields: checkoutFields({
            pickup_address: 'required',
            return_address: 'required',
            date: 'required',
            time: 'required',
            branch: 'hidden',
            customer_address: 'hidden',
            map_pin: 'hidden',
            meeting_details: 'hidden',
            collection_branch: 'hidden',
            photos: 'hidden'
        }),
        tracking_events: Object.freeze(['requested', 'for_pickup', 'pickup_completed', 'in_service', 'out_for_return', 'completed']),
        notes: 'Good for laundry, shoe cleaning, tailoring, and repair with a round-trip. Schema now exists '
            + "(ServiceBookingHandoffLeg, Phase 88) but nothing writes to it yet - still blocked on the "
            + "pickupReturnLogistics capability module, currently status: 'planned', which flips only once the "
            + 'API/storefront/POS phases actually ship (ADR 0064 decision 6).'
    }),
    item_pickup_collection: Object.freeze({
        order: 6,
        label: 'Pickup and collection at the store',
        summary: 'The business collects the item, but the customer returns to the store to collect it.',
        status: 'planned',
        final_action: 'send_booking_request',
        // Populated by Phase 88 of #482 (ADR 0064 decision 7) - see item_pickup_return above.
        service_area_types: Object.freeze(['item_handoff']),
        planned_module: 'pickupReturnLogistics',
        checkout_fields: checkoutFields({
            pickup_address: 'required',
            collection_branch: 'required',
            date: 'required',
            time: 'required',
            branch: 'hidden',
            customer_address: 'hidden',
            map_pin: 'hidden',
            meeting_details: 'hidden',
            return_address: 'hidden',
            photos: 'hidden'
        }),
        tracking_events: Object.freeze(['requested', 'for_pickup', 'pickup_completed', 'in_service', 'ready_for_collection', 'completed']),
        notes: 'Good for laundry, repair, and tailoring where the business collects but the customer returns to the store. '
            + "Blocked on the pickupReturnLogistics capability module, currently status: 'planned' - same gap as "
            + 'item_pickup_return.'
    }),
    item_dropoff_collection: Object.freeze({
        order: 7,
        label: 'Drop-off and collection at the store',
        summary: 'The customer brings the item to the branch and returns later to collect it.',
        status: 'planned',
        final_action: 'send_booking_request',
        service_area_types: Object.freeze([]),
        planned_module: 'pickupReturnLogistics',
        checkout_fields: checkoutFields({
            branch: 'required',
            date: 'required',
            time: 'required',
            customer_address: 'hidden',
            map_pin: 'hidden',
            meeting_details: 'hidden',
            pickup_address: 'hidden',
            return_address: 'hidden',
            collection_branch: 'hidden',
            photos: 'hidden'
        }),
        tracking_events: Object.freeze(['requested', 'for_dropoff', 'dropoff_completed', 'in_service', 'ready_for_collection', 'collected', 'completed']),
        notes: 'Best recorded by staff in POS, not offered as an online checkout choice - a physical drop-off/collect shop. '
            + "The backend does not have these handoff events as a flexible contract yet; blocked on the same "
            + "pickupReturnLogistics capability module, currently status: 'planned'."
    }),
    quote_request: Object.freeze({
        order: 8,
        label: 'Quote-first service',
        summary: 'The final price is not known until the business reviews the request.',
        status: 'planned',
        final_action: 'request_a_price',
        service_area_types: Object.freeze([]),
        planned_module: null,
        checkout_fields: checkoutFields({
            photos: 'optional',
            date: 'optional',
            branch: 'hidden',
            customer_address: 'hidden',
            map_pin: 'hidden',
            time: 'hidden',
            meeting_details: 'hidden',
            pickup_address: 'hidden',
            return_address: 'hidden',
            collection_branch: 'hidden'
        }),
        tracking_events: Object.freeze(['requested', 'quoted', 'accepted', 'completed']),
        notes: 'Good for custom tailoring, large repair work, and inspections. No pricing-request lifecycle exists in the '
            + 'backend today - there is no in-between state for "business is preparing a quote" and no field to hold the '
            + 'quoted price. planned_module is null because no existing Capability Module names this gap; it would need one.'
    })
});

export const FULFILLMENT_PROFILE_KEYS = Object.freeze(
    Object.keys(FULFILLMENT_PROFILES).sort(
        (a, b) => FULFILLMENT_PROFILES[a].order - FULFILLMENT_PROFILES[b].order
    )
);

export const SHIPPED_FULFILLMENT_PROFILE_KEYS = Object.freeze(
    FULFILLMENT_PROFILE_KEYS.filter((key) => FULFILLMENT_PROFILES[key].status === 'shipped')
);

export const PLANNED_FULFILLMENT_PROFILE_KEYS = Object.freeze(
    FULFILLMENT_PROFILE_KEYS.filter((key) => FULFILLMENT_PROFILES[key].status === 'planned')
);

export const resolveFulfillmentProfile = (profileKey) => (
    FULFILLMENT_PROFILES[String(profileKey || '').trim()] || null
);

/**
 * The Phase 37 entry point: which fulfillment profile(s) a given
 * ServiceItemDetail.service_area_type maps onto. Originally resolved only to `shipped` profiles,
 * since `service_area_type` was itself a live, shipped enum and a `planned` profile had no
 * `service_area_types` entries to match against by construction. Phase 88 of #482 (ADR 0064
 * decision 7) is the one deliberate exception: `item_handoff` resolves to two still-`planned`
 * profiles (`item_pickup_return`, `item_pickup_collection`) at once - the customer picks the
 * variant at checkout, the legs record which (ADR 0064 decision 3).
 */
export const resolveFulfillmentProfilesForServiceAreaType = (serviceAreaType) => {
    const normalized = String(serviceAreaType || '').trim();
    if (!normalized) return Object.freeze([]);
    return Object.freeze(
        FULFILLMENT_PROFILE_KEYS.filter((key) => (
            FULFILLMENT_PROFILES[key].service_area_types.includes(normalized)
        ))
    );
};

/**
 * Joins a fulfillment profile with its planned Capability Module's live
 * metadata (label/notes), when it has one. Pure derivation - no new
 * state, so it can never drift from CAPABILITY_MODULES.
 */
export const describeFulfillmentProfile = (profileKey) => {
    const entry = resolveFulfillmentProfile(profileKey);
    if (!entry) return null;
    const plannedModule = entry.planned_module ? CAPABILITY_MODULES[entry.planned_module] || null : null;
    return Object.freeze({
        key: profileKey,
        ...entry,
        planned_module_label: plannedModule ? plannedModule.label : null
    });
};
