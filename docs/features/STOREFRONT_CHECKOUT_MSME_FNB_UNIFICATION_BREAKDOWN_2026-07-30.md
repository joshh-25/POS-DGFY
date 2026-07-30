# Storefront Checkout: MSME + F&B UI/UX and Process Unification — Breakdown (2026-07-30)

Branch: `layout/storefront_checkout`

This breaks the checkout unification work into small, self-contained modifications. Each one lists what changed, what's new, what's gone, why, and exactly where in the code. For the full narrative (payment-option policy, cross-mode blast-radius warnings, etc.) see [`CHECKOUT_UNIFICATION.md`](CHECKOUT_UNIFICATION.md) in this same folder — this document is the same work, organized as a numbered checklist instead of prose.

Both modes still submit to the same single backend endpoint (`POST /api/v1/store/checkout`); everything below is a frontend-only change unless stated otherwise.

---

## 1. Modification name: Unified 3-step checkout visual chrome (Account → Fulfillment → Review & Payment)

**Files changed:**
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutCustomerStep.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutFulfillmentStep.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutPaymentStep.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleOrderMethodSelector.jsx`

**Files Added:** none (this modification restyles existing MSME components; new components are covered separately below)

**Files deleted:** none

**Reason for the modification:**
MSME (Simple mode) checkout previously had its own, slightly different visual language (16px card radius, plain text buttons, flat `#ea580c` orange CTAs) from F&B's checkout (20px radius, icon-equipped chevron buttons, gradient CTAs, connected stepper). This pass converges MSME's layout/chrome onto F&B's — same card shapes, same button styles, same step title casing ("Review & Payment") — while keeping each mode's own component tree (there is no shared `CheckoutStep` component; only shared leaf primitives) and MSME's own teal brand color.

**Codes changed/added:**
- `SimpleCheckoutCustomerStep.jsx` — card `borderRadius: 16 → 20`, title weight `900 → 800`/color `#0f172a → #1e293b`; Back/Continue buttons rebuilt with `ChevronLeft`/`ChevronRight` icons and a `linear-gradient(180deg, #0f766e 0%, #134e4a 100%)` CTA (was flat `#ea580c`).
- `SimpleCheckoutPaymentStep.jsx` — same card radius/title treatment; heading text changed to "Step 3: Review & Payment".
- `SimpleOrderMethodSelector.jsx` — adds a `SIMPLE_ORDER_METHOD_ICONS` map (`Truck`/`ShoppingBag`) so Delivery/Pickup cards now show icons, matching F&B's icon-equipped selector cards; card sizing bumped (`minHeight 48 → 52/64`, `borderRadius 12 → 14`, new `iconBoxSize`/`iconSize`).

---

## 2. Modification name: MSME gets a real Now/Schedule toggle, and the underlying schedule-drop bug is fixed

**Files changed:**
- `frontend/apps/store/src/modes/simple/checkout/hooks/useSimpleCheckoutRouteProps.js`
- `frontend/apps/store/src/modes/simple/checkout/hooks/useSimpleCheckoutGating.js`
- `frontend/apps/store/src/__tests__/buildFnbCheckoutPayload.test.js`

**Files Added:**
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutFulfillmentChoices.jsx` — MSME's own Order Type + Now/Schedule section, mirroring F&B's `FnbCheckoutFulfillmentChoices.jsx` two-column layout, teal-styled.

**Files deleted:** none directly (the file this logic used to live in, `SimpleCheckoutScheduleFields.jsx`, is removed as part of modification #3 below)

**Reason for the modification:**
Before this fix, **MSME orders silently dropped their schedule.** The old schedule picker only ever called `setFnbScheduledFor` — it never flipped `fnbScheduleMode` away from its default `'asap'` (only F&B's own fulfillment-choices component did that). Since `buildFnbCheckoutPayload.js` only includes `scheduled_for` in the submitted payload when `fnbScheduleMode === 'schedule'`, every MSME order sent `scheduled_for: null` regardless of what the customer actually picked. The original stopgap made MSME's schedule mandatory (no "Now" option) to sidestep the bug; this pass fixes the real cause and restores a genuine Now/Schedule choice.

**Codes changed/added:**
- `useSimpleCheckoutRouteProps.js:160-162` — `onScheduledForChange` now calls both `setFnbScheduledFor(nextScheduledFor)` **and** `setFnbScheduleMode('schedule')`, so picking a date actually activates schedule mode.
- `useSimpleCheckoutGating.js:27` — `simpleStepOneReady = cart.length > 0 && (fnbScheduleMode !== 'schedule' || Boolean(fnbScheduledFor))`: a date/time is only required when Schedule mode is actively selected; "Now" needs nothing, exactly like F&B.
- `buildFnbCheckoutPayload.test.js` — two new regression-guard tests: one asserting `scheduled_for` is populated when `fnbScheduleMode: 'schedule'`, one asserting it stays `null` under `'asap'` even with a stale `fnbScheduledFor` value present.
- This fix lives upstream of `buildFnbCheckoutPayload.js` itself (which stays mode-agnostic) and upstream of `useFnbCheckoutQuote.js` (MSME's "Get Quote" button, shared with F&B) — both were automatically corrected without their own code changing.

---

## 3. Modification name: MSME Fulfillment step reorganized (branch-picker dropdown removed, sections split into smaller components)

**Files changed:**
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutFulfillmentStep.jsx`

**Files Added:**
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleSpecialInstructionsField.jsx` — MSME's standalone special-instructions field.

**Files deleted:**
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutScheduleFields.jsx` — the old combined schedule + special-instructions component; split apart (see modifications #2 and this one).
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleDeliveryAddressField.jsx` — superseded by the saved-address selector (modification #4).
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleDeliveryPinPanel.jsx` — superseded by the expanded map modal (modification #4).

**Reason for the modification:**
The Fulfillment step's "Fulfillment Location" branch-picker dropdown was removed from the checkout UI entirely — this is a frontend-only change; `storeLocations`/`selectedLocationId` state and the existing location auto-select logic in `StorefrontApp.jsx` are untouched, so a sensible default location is still resolved automatically. With that dropdown gone, the step's sections were reordered into three clear, single-purpose pieces instead of two large combined ones: (1) Order Type + Date/Time, (2) Location, (3) Special Instructions.

**Codes changed/added:**
- `SimpleCheckoutFulfillmentStep.jsx:3-6` — imports the four new/replacement components (`SimpleCheckoutExpandedMapModal`, `SimpleCheckoutFulfillmentChoices`, `SimpleCheckoutSavedAddressSelector`, `SimpleSpecialInstructionsField`).
- `SimpleCheckoutFulfillmentStep.jsx:71` — renders `SimpleCheckoutFulfillmentChoices` first (Order Type + Now/Schedule).
- `SimpleCheckoutFulfillmentStep.jsx:222` — renders `SimpleSpecialInstructionsField` last, as its own section (previously bundled inside `SimpleCheckoutScheduleFields.jsx`).

---

## 4. Modification name: MSME gets its own saved-address selector and expanded map modal (mirrors F&B's)

**Files changed:**
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutFulfillmentStep.jsx` (wiring only — see modification #3 for the import/render lines)

**Files Added:**
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutSavedAddressSelector.jsx` — MSME's own saved-address list, mirroring `FnbCheckoutSavedAddressSelector.jsx`.
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutExpandedMapModal.jsx` — MSME's own full-screen map modal, mirroring `FnbCheckoutExpandedMapModal.jsx`.

**Files deleted:**
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleDeliveryAddressField.jsx` — replaced by `SimpleCheckoutSavedAddressSelector.jsx`.
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleDeliveryPinPanel.jsx` — replaced by `SimpleCheckoutExpandedMapModal.jsx`.

**Reason for the modification:**
The old single-purpose address field and pin panel are replaced with MSME's own equivalents of F&B's already-existing saved-address list and expanded map modal, so MSME customers get the same "pick a saved address or drop a pin on a full map" experience F&B customers already have — while keeping MSME's own, independent component (not literally shared with F&B's).

**Codes changed/added:**
- `SimpleCheckoutFulfillmentStep.jsx:90` — `<SimpleCheckoutSavedAddressSelector ... />` renders inside the Location section.
- `SimpleCheckoutFulfillmentStep.jsx:167-216` — `<SimpleCheckoutExpandedMapModal>` wraps the pin-drop map experience, opened from the Location section.

---

## 5. Modification name: Each mode gets its own journey header and order-review list (not shared, by design)

**Files changed:**
- `frontend/apps/store/src/modes/simple/checkout/pages/SimpleCheckoutRoutePage.jsx`
- `frontend/apps/store/src/modes/fnb/checkout/components/FnbCheckoutPaymentStep.jsx`
- `frontend/apps/store/src/modes/fnb/checkout/pages/FnbCheckoutRouteContainer.jsx` (threads `cart`, `cartImageErrors`, `money`, `onImageError` down to the new review list)

**Files Added:**
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutJourneyHeader.jsx` — MSME's own stepper header, structurally mirroring F&B's `FnbCheckoutJourneyHeader.jsx` (own steps array, own hero copy, `variant="connected"`) but keeping MSME's teal accent (`#0f766e`) instead of F&B's blue. Confirmation is a post-order state in both modes, not a clickable 4th step — both headers only ever render 3 steps.
- `frontend/apps/store/src/modes/fnb/checkout/components/FnbCheckoutReviewItemsList.jsx` — F&B's own read-only order recap (thumbnail rows) for the payment step, styled to match `FnbCheckoutSummaryContent.jsx`. Deliberately **not** shared with MSME's equivalent component, consistent with the "two independent trees" design decision for this whole pass.

**Files deleted:** none

**Reason for the modification:**
MSME needed a stepper header with the same structure/step-count as F&B's but its own brand color; F&B's payment step needed a read-only recap of what's being purchased before submit, which didn't exist before. Both are net-new, mode-specific components rather than one shared component, so each mode can evolve its header/recap independently later without a cross-mode blast radius.

**Codes changed/added:**
- `SimpleCheckoutRoutePage.jsx:101` — renders `<SimpleCheckoutJourneyHeader ... />`.
- `FnbCheckoutPaymentStep.jsx:43` — renders `<FnbCheckoutReviewItemsList ... />`, fed by the new `cart`/`cartImageErrors`/`money`/`onImageError` props threaded in from `FnbCheckoutRouteContainer.jsx`.

---

## 6. Modification name: F&B Special Instructions field moved from the Customer step to the Fulfillment step (matches MSME's placement)

**Files changed:**
- `frontend/apps/store/src/modes/fnb/checkout/components/FnbCheckoutCustomerStep.jsx`
- `frontend/apps/store/src/modes/fnb/checkout/pages/FnbCheckoutRouteContainer.jsx`

**Files Added:** none
**Files deleted:** none

**Reason for the modification:**
This is the one place the unification runs in the opposite direction — F&B adjusts to match MSME, not the other way around. F&B's Special Instructions field used to live in Step 1 (Customer Details); MSME's equivalent (`SimpleSpecialInstructionsField.jsx`, see modification #3) lives in the Fulfillment step. F&B's field is moved to match, so both modes ask for special instructions at the same point in the journey.

**Codes changed/added:**
- `FnbCheckoutCustomerStep.jsx` — the `specialInstructions`/`onSpecialInstructionsChange` props and the `<label>...<textarea>` block are removed entirely from this component.
- `FnbCheckoutRouteContainer.jsx` — the same `<label>...<textarea>` markup (identical placeholder, 250-char counter) is re-added directly inside the Fulfillment step section, right after the expanded map modal; the `onSpecialInstructionsChange`/`specialInstructions` props passed into `FnbCheckoutCustomerStep` are removed from that call site.

---

## 7. Modification name: Payment options are unchanged — only the surrounding chrome is unified

**Files changed:**
- `frontend/apps/store/src/modes/fnb/checkout/components/FnbCheckoutPaymentStep.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutPaymentActions.jsx`

**Files Added:** none
**Files deleted:** none

**Reason for the modification:**
To avoid confusion: no payment method was added, removed, or enabled/disabled for either mode in this pass. F&B remains cash-only, now showing a static, inert "Online payment — Coming soon" note (not a clickable/disabled dropdown option, since the shared `StorefrontDropdown` component has no per-option disabled state — a disabled-looking-but-clickable entry would have been a functional trap). MSME's payment list (cash, GCash, Maya, card, bank transfer) was already functional before this pass and is untouched functionally; only its surrounding visual chrome was restyled to match F&B (see modification #1), and its stray orange CTA was recolored (see modification #8).

**Codes changed/added:**
- `FnbCheckoutPaymentStep.jsx:4-13` — `FnbOnlinePaymentPlaceholder()`, a structural placeholder component rendering "Online payment" / "Coming soon — cash is the only option for now."; rendered at line 42.
- `SimpleCheckoutPaymentActions.jsx` — visual chrome only (see modification #8 for the specific color change); the payment-option list itself, defined inline in `SimpleCheckoutRoutePage.jsx`, is untouched.

---

## 8. Modification name: MSME checkout step-gating logic extracted out of `StorefrontApp.jsx`

**Files changed:**
- `frontend/apps/store/src/StorefrontApp.jsx`

**Files Added:**
- `frontend/apps/store/src/modes/simple/checkout/hooks/useSimpleCheckoutGating.js` — MSME's step-readiness logic (see modification #2 for `simpleStepOneReady`'s exact rule).

**Files deleted:** none

**Reason for the modification:**
MSME-specific step-gating rules (like the schedule-required check from modification #2) don't belong inlined directly in the top-level app shell. Extracting them into their own hook keeps `StorefrontApp.jsx` a plain pass-through and gives MSME's gating logic a single, dedicated place to live and be tested independently of F&B's.

**Codes changed/added:**
- `StorefrontApp.jsx:208` — imports `useSimpleCheckoutGating`.
- `StorefrontApp.jsx:2724-2725` — calls the hook and destructures `simpleStepOneReady`.
- `StorefrontApp.jsx:2808` — passes `simpleStepOneReady` down through props, same as before the extraction (call-site behavior is unchanged, only the source of the logic moved).

---

## 9. Modification name: Color consistency fix — stray orange buttons replaced with MSME's own teal

**Files changed:**
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutCustomerStep.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutFulfillmentStep.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutPaymentActions.jsx`

**Files Added:** none
**Files deleted:** none

**Reason for the modification:**
Three checkout buttons across these files used a flat orange (`#ea580c`) that didn't match MSME's own established brand color used everywhere else in the storefront (`SimpleHero.jsx` and others already use `#0f766e`/`#134e4a` throughout). This wasn't an intentional second brand color, so it's corrected to match.

**Codes changed/added:**
- All three files: the flat `#ea580c` background is replaced with the same `linear-gradient(180deg, #0f766e 0%, #134e4a 100%)` gradient used by the rest of MSME's checkout CTAs (see modification #1's `SimpleCheckoutCustomerStep.jsx` example). Verified zero remaining occurrences of `#ea580c` in these three files after the change.
