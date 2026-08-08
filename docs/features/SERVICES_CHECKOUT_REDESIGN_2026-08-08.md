# Services Checkout Redesign (2026-08-08)

Status: **Implemented.** Uncommitted on `layout/Storefront_Modifications`.
Scope: Frontend only (`frontend/apps/store`), Services mode (`isServicesMode`) booking flow. No backend routes, controllers, or validators were touched.

## Goal

Recreate the Services storefront's booking/checkout page as a 4-step wizard —
**Account → Add-ons → Fulfillment → Review and Payment** — matching a set of
reference wireframes, while reusing existing data sources and preserving the
codebase's established "independent trees" convention (each mode owns its own
checkout files; only true leaf primitives are shared with F&B/Retail/MSME).

The flow replaced Services' previous 3-step wizard (Details → Review →
Payment), which merged customer identity, schedule, and location into one
step and displayed the cart as row-based text summaries.

## New files

| File | Why |
|---|---|
| `frontend/apps/store/src/modes/services/booking/components/ServiceBookingJourneyHeader.jsx` | Composes the shared `CheckoutHeroHeader` + `CheckoutStepProgressHeader` primitives into Services' own "Order Journey" hero card and 4-step connected stepper — mirrors F&B's `FnbCheckoutJourneyHeader.jsx` pattern; Services previously had no journey header, just a bare `<h1>`. |
| `frontend/apps/store/src/modes/services/booking/components/ServiceBookingFulfillmentChoices.jsx` | New Delivery/Pickup handoff chooser for Step 3. Started as a Delivery/Pickup + Now/Schedule chooser (mirroring F&B's `FnbCheckoutFulfillmentChoices.jsx`); the Now/Schedule half was later removed in favor of an always-on calendar, and the two handoff cards were rebuilt as a local component (not the shared `SelectableOptionCard`) so their longer, reworded labels ("Pick up and deliver" / "Pick up and I'll collect") can wrap in a 2-column layout without touching the shared primitive other modes depend on. |
| `frontend/apps/store/src/modes/services/booking/components/ServiceBookingAddOnsStep.jsx` | New "Step 2: Add-ons" — card-based listing of the customer's selected service(s), replacing the old row-based recap. Each card is an expandable accordion with a real (non-decorative) add-on toggle, a "With Add-ons"/"Without Add-ons" status pill, and a step-level special-instructions textarea. |

## Modified files

| File | Why |
|---|---|
| `frontend/apps/store/src/StorefrontApp.jsx` | Added new local state for the redesign: `serviceOrderMethod`, `serviceScheduleMode`, `serviceLineAddOns` (per-cart-line add-on selections), `serviceSpecialInstructions`. Threaded all of it into `useServiceBookingDerivations` and `useStorefrontCatalogRouteProps`. Also threaded `isBookingSubpage` into the cart-drawer-shell props chain to fix a bug where the floating "cart FAB" summary bar stayed visible (and overlapped the page) while already on the Services booking page. |
| `frontend/apps/store/src/modes/services/booking/hooks/useServiceBookingDerivations.js` | Split the old single `stepOneComplete` gate into `accountStepComplete`/`fulfillmentStepComplete` for the 4-step wizard. Added `serviceOrderMethod`, `serviceScheduleMode`, `serviceLineAddOns` params and passes them to the summary model. Returns the new `groupedServiceLineItems`. |
| `frontend/apps/store/src/modes/services/booking/model/serviceBookingSummary.js` | Added `SERVICE_ADD_ON_OPTIONS`, a fixed placeholder add-on catalog (no per-service add-on data model exists in the backend yet). Added `groupedServiceLineItems`: buckets cart lines by (service name + exact add-on combination) so e.g. 3 units of a service with an add-on and 2 units without it render as two separate summary rows instead of one merged row. Removed the "Location" summary row, reworded the "Services" row value ("N services selected" → "N Services"), and added a "Fulfillment type" row (Delivery/Pickup). |
| `frontend/apps/store/src/modes/services/booking/components/ServiceBookingSteps.jsx` | Restructured from three step exports (`ServiceBookingStepOne/Two/Three`) to four (`ServiceBookingStepAccount`, `ServiceBookingStepFulfillment`, `ServiceBookingStepReviewPayment`). Step 1 gained a bordered card matching Retail's font sizes and a "Back" button. Step 3 gained the handoff chooser, dropped the Now/Schedule toggle, and always shows the location section. Step 4 was rebuilt with "Selected services" (name/qty/add-ons/price), "Fulfillment Information" (handoff/date/time/address, with "Edit section" links), and "Additional Instructions" sections, all enclosed in one bordered box with a header matching the other steps, followed by the pre-existing payment section unchanged. |
| `frontend/apps/store/src/modes/services/booking/components/ServiceBookingDetailsForm.jsx` | Merged the separate Date and Time fields into one combined field ("Aug 8, 2026, 9:00 AM") with an inline time-slot dropdown; removed the "Number of Units" and old "Additional Instructions" fields (instructions moved to the Add-ons step); removed the component's own bordered wrapper to avoid a double-boxed look now that the parent step already provides one. |
| `frontend/apps/store/src/modes/services/booking/components/ServiceBookingSummaryCard.jsx` | Re-skinned the sticky Booking Summary sidebar: total + row list + "Services Ordered" breakdown using the new grouped line items (name, quantity, add-on labels, price), a center-left image placeholder per item, and no per-item border/card box. |
| `frontend/apps/store/src/modes/services/storefront/components/StorefrontServicesCatalog.jsx` | The orchestrator: swapped in the new step components and 4-way routing, replaced the old inline header with `ServiceBookingJourneyHeader`, matched the page header/body padding and max-width to F&B's, added the "Message Us" header button, removed the old row-based `ServiceBookingSelectedServiceCard` usage, and threads all the new state (`serviceLineAddOns`, `groupedServiceLineItems`, `serviceSpecialInstructions`, etc.) to the step components. |
| `frontend/apps/store/src/app/hooks/useStorefrontCatalogRouteProps.js` | Plain pass-through hook — added the new Services fields to its param list and return object so they reach `StorefrontServicesCatalog`. |
| `frontend/apps/store/src/app/pages/StorefrontCatalogRouteContainer.jsx` | Same pass-through threading, one layer further down to the `<StorefrontServicesCatalog>` JSX invocation. |
| `frontend/apps/store/src/app/hooks/useStorefrontCartDrawerShellProps.js` | Added `isBookingSubpage` pass-through (part of the duplicate-checkout-bar bugfix below). |
| `frontend/apps/store/src/app/pages/StorefrontCartDrawerShellContainer.jsx` | Passes `isBookingSubpage` down to `StorefrontCartFab`. |
| `frontend/apps/store/src/shared/components/storefront/StorefrontCartFab.jsx` | Added `isServicesMode && isBookingSubpage` to the FAB's hide-conditions, mirroring F&B's existing `isFnbOrderSubpage` check — fixes the floating cart-summary button rendering on top of the Services booking page instead of hiding like F&B's equivalent already did. |

## Key decisions

- **Add-ons are real, per-cart-line state, not decorative.** `serviceLineAddOns` lives in `StorefrontApp.jsx` and is threaded to both the Add-ons step (where it's toggled) and the summary model (where it drives grouping). The add-on *catalog* itself (`SERVICE_ADD_ON_OPTIONS`) is a fixed placeholder, since no backend concept of service add-ons exists yet.
- **No new backend work.** Every new field/state is frontend-only; nothing new is submitted to the API. `serviceOrderMethod`/`serviceScheduleMode` only change which existing fields are required client-side.
- **Shared primitives were left unmodified.** `CheckoutHeroHeader`, `CheckoutStepProgressHeader`, and `SelectableOptionCard` are reused as-is from `shared/components/checkout/`; wherever Services' new design needed something those primitives couldn't do (e.g., multi-line wrapping labels), a local Services-only component was built instead, so F&B/Retail/MSME's own checkout rendering is unaffected.
- **`ServiceBookingDetailsForm`'s date/time picker always renders**, regardless of schedule mode — the "Now" concept was ultimately removed in favor of always requiring a scheduled date/time, so this is no longer a special case.
