# MSME (Simple) & F&B Checkout Layout Refinement — Session Documentation (2026-07-31)

This documents every change made in this session to bring MSME/Simple's checkout UI to visual and structural parity with F&B's checkout UI, and to fix a handful of bugs (some pre-existing, some introduced mid-session while hand-porting one tree's markup into the other). The two checkout trees remain intentionally independent — `modes/simple/checkout/` and `modes/fnb/checkout/` each keep their own components; only genuine shared leaf primitives (e.g. `SelectableOptionCard`, `PaymentMethodSelectorBlock`) are reused across both.

Each entry below: task, reason, and the files touched.

---

## 1. Debug `SimpleCheckoutStoreHeader.jsx`

**Reason:** The user was hand-porting F&B's header markup into MSME's header and left several variables referenced but never declared as props (`isResponsiveFlow`, `onBack`, `isDeliveryOrder`, `displayFont`, `brandColor`, `textOnBrand`, `brandShadow`), guaranteeing a `ReferenceError` on render.

**Files Modified:**
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutStoreHeader.jsx`
- `frontend/apps/store/src/modes/simple/checkout/pages/SimpleCheckoutRoutePage.jsx`

---

## 2. Match MSME header font/weight to F&B

**Reason:** Store-name styling already matched; the "Delivery/Pickup order" eyebrow label had no explicit `fontFamily`, so it fell back to MSME's ambient font instead of the shared `servicesBodyFont` F&B uses.

**Files Modified:**
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutStoreHeader.jsx`
- `frontend/apps/store/src/modes/simple/checkout/pages/SimpleCheckoutRoutePage.jsx`

---

## 3. Fix cart drawer auto-opening on every add-to-cart (MSME)

**Reason:** The shared `addToCart` handler opened the cart drawer for *any* non-F&B mode (`!isFnbMode`), including MSME — so every add-to-cart forced the drawer open instead of only opening it via the FAB.

**Files Modified:**
- `frontend/apps/store/src/shared/hooks/useCartMutations.js`
- `frontend/apps/store/src/StorefrontApp.jsx`

---

## 4. Fix product-cart FAB stacking order (MSME)

**Reason:** The floating cart button (`z-index: 2100`) rendered above the "Added products" drawer (`z-index: 2095`), so it stayed visible on top of the drawer instead of being covered by it.

**Files Modified:**
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCartFloatingButton.jsx`

---

## 5. Fix broken `FnbCheckoutJourneyHeader.jsx`

**Reason:** The user hand-copied MSME's journey-header structure into F&B's file, leaving a duplicate `const steps` declaration (syntax error), a reference to a removed prop (`isFulfillmentStepComplete`), and undefined `SIMPLE_ACCENT*` color constants copied verbatim from MSME instead of using F&B's own themeable brand props.

**Files Modified:**
- `frontend/apps/store/src/modes/fnb/checkout/components/FnbCheckoutJourneyHeader.jsx`
- `frontend/apps/store/src/modes/fnb/checkout/pages/FnbCheckoutRouteContainer.jsx`

---

## 6. Reimplement `SimpleCheckoutStoreHeader.jsx` after it reverted

**Reason:** The file reverted back to its original bare-bones pre-F&B-matching state (lost the `ArrowLeft` icon button, delivery/pickup label, teal "Message Us" button). Re-applied the same fix as items 1–2.

**Files Modified:**
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutStoreHeader.jsx`
- `frontend/apps/store/src/modes/simple/checkout/pages/SimpleCheckoutRoutePage.jsx`

---

## 7. Remove x-axis spacing between screen edge and header (desktop)

**Reason:** MSME's route wrapper had a single `maxWidth: 1240, margin: '0 auto'` div wrapping *both* the header and the step content, so the header itself got squeezed and centered inside a 1240px column on wide screens — unlike F&B, whose outermost wrapper is full-width with only the step content constrained to 1240px in a separate inner div.

**Files Modified:**
- `frontend/apps/store/src/modes/simple/checkout/pages/SimpleCheckoutRoutePage.jsx` (restructured into the same two-tier layout as F&B: full-width outer wrapper + centered 1240px inner wrapper)

---

## 8. Match MSME's content x-margin to F&B's exactly

**Reason:** After item 7, MSME's inner wrapper had no horizontal padding of its own (relying purely on `maxWidth` centering), while F&B's inner wrapper adds an explicit `40px` (desktop) / `16px` (mobile) padding on top of that centering.

**Files Modified:**
- `frontend/apps/store/src/modes/simple/checkout/pages/SimpleCheckoutRoutePage.jsx`

---

## 9. Rebuild MSME's Order Summary to match F&B's content (desktop)

**Reason:** MSME's order summary (used across all 3 steps) only showed a title/amount/status rows — missing the big total, Fulfillment/Schedule/Items rows, itemized cart list with images, promo-code prompt, and the "Secure & Private" trust card that F&B's summary has.

**Files Modified:**
- `frontend/apps/store/src/modes/simple/checkout/pages/SimpleCheckoutRoutePage.jsx`
- `frontend/apps/store/src/modes/simple/checkout/hooks/useSimpleCheckoutRouteProps.js`
- `frontend/apps/store/src/StorefrontApp.jsx`

**Files Created:**
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutSummaryContent.jsx`

**Files Deleted:**
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutSummaryCard.jsx` (fully superseded, no remaining references)

---

## 10. Fix F&B's mobile order summary (bottom sheet)

**Reason:** F&B's mobile summary bottom sheet only showed the item list and Subtotal/Delivery Fee/Fees & Taxes/Total — missing the big total amount, Fulfillment/Schedule/Items status rows, and the promo-code prompt that the desktop version has.

**Files Modified:**
- `frontend/apps/store/src/modes/fnb/checkout/components/FnbCheckoutMobileSummaryPanel.jsx`
- `frontend/apps/store/src/modes/fnb/checkout/pages/FnbCheckoutRouteContainer.jsx`

---

## 11. Replicate F&B's mobile order-summary panel for MSME

**Reason:** MSME had no mobile-specific bottom-sheet/floating-footer summary at all — the full desktop summary card just rendered inline at the bottom of the page flow. Built MSME's own dedicated mobile panel (not reusing F&B's file) mirroring the same bottom-sheet + floating footer pattern, teal-branded, adapted to MSME's sequential step numbering.

**Files Modified:**
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/modes/simple/checkout/hooks/useSimpleCheckoutRouteProps.js`
- `frontend/apps/store/src/modes/simple/checkout/pages/SimpleCheckoutRoutePage.jsx`

**Files Created:**
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutMobileSummaryPanel.jsx`

---

## 12. Replicate F&B's mobile saved-addresses layout on MSME

**Reason:** F&B's mobile fulfillment step shows a compact address card ("Delivery address" eyebrow + single active/default address + "View All Saved Addresses" button) that opens a "Saved Addresses" bottom sheet listing every saved location. MSME's selector had no such mobile-compact branch — it only rendered the full scrollable list inline, both on mobile and desktop.

**Files Modified:**
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutSavedAddressSelector.jsx` (added the mobile compact branch)
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutFulfillmentStep.jsx` (wired the modal open/close state, subtitle switches between "Select or pin your location on the map." / "Saved locations")
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/modes/simple/checkout/hooks/useSimpleCheckoutRouteProps.js`

**Files Created:**
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutSavedAddressesModal.jsx` (MSME's own bottom sheet, not reusing F&B's inline modal)

---

## 13. Add missing section title to F&B's special-instructions field

**Reason:** F&B already had a working special-instructions textarea wired to state and the checkout payload, but it rendered as a bare, untitled label — unlike MSME's numbered "4. Anything else we should know?" section header.

**Files Modified:**
- `frontend/apps/store/src/modes/fnb/checkout/pages/FnbCheckoutRouteContainer.jsx`

---

## 14. Replicate F&B's item-list layout on MSME's Payment step

**Reason:** MSME's payment-step item recap was a bare list (name × qty — price, no images, no "YOUR ITEMS" heading), unlike F&B's thumbnail + name + qty + price row layout.

**Files Modified:**
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutReviewItemsList.jsx` (rewritten)
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutPaymentStep.jsx`
- `frontend/apps/store/src/modes/simple/checkout/pages/SimpleCheckoutRoutePage.jsx`

---

## 15. Remove duplicate mobile action buttons on MSME ("Get Quote", extra Back/Continue)

**Reason:** Once MSME had its own floating mobile summary footer (item 11) with its own Back/Continue/Place Order buttons, each step's in-card Back/Continue/Get-Quote row became a redundant duplicate control on mobile.

**Files Modified:**
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutCustomerStep.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutFulfillmentStep.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutPaymentActions.jsx`

---

## 16. Fix "checkout pushed too far right" bug (MSME mobile)

**Reason:** A CSS grid blowout — `SimpleOrderMethodSelector.jsx` and `SimpleCheckoutFulfillmentChoices.jsx` used bare `gridTemplateColumns: '1fr 1fr'` for the Delivery/Pickup and NOW/Schedule button pairs. Bare `1fr` tracks default to `minmax(auto, 1fr)`, so when button content didn't fit, the track refused to shrink and blew out past its container — and since no ancestor grid re-clamped it, the entire page content (391px) rendered wider than the 320px viewport, silently clipped by `<main>`'s `overflow-x: clip`. Also fixed a secondary truncation/overlap issue exposed once the blowout was fixed: the shared `SelectableOptionCard` label had no text-truncation styling.

**Files Modified:**
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleOrderMethodSelector.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutFulfillmentChoices.jsx`
- `frontend/apps/store/src/shared/components/checkout/SelectableOptionCard.jsx`

---

## 17. Investigate "location/address disappeared" report (F&B)

**Reason:** Confirmed via full diff review that no code touched the `{isDeliveryOrder && (...)}` address block — the screenshot showed "Pickup" selected, and the address section is correctly hidden for pickup orders by design (identical to MSME's own gating). No bug, no change made.

**Files Modified:** none

---

## 18. Replicate MSME's step title/description/bordered-container pattern onto F&B mobile

**Reason:** All three of F&B's mobile step components hid their title and description behind `{!isResponsive ? ... : null}`, and the Fulfillment step additionally dropped its border/padding entirely on mobile (`border: 'none', padding: 0`) — unlike MSME, which always shows a bordered card with a numbered title and description regardless of viewport.

**Files Modified:**
- `frontend/apps/store/src/modes/fnb/checkout/components/FnbCheckoutCustomerStep.jsx`
- `frontend/apps/store/src/modes/fnb/checkout/components/FnbCheckoutFulfillmentStep.jsx`
- `frontend/apps/store/src/modes/fnb/checkout/components/FnbCheckoutPaymentStep.jsx` (also renamed the title to "Step 3: Review & Payment" and added a description line, matching MSME's wording)

---

## 19. Fix "items leaking out of container" (F&B fulfillment step)

**Reason:** Same root cause as item 16 — F&B's `FnbCheckoutFulfillmentChoices.jsx` used the identical bare `'1fr 1fr'` grid pattern (it was the original source MSME's version was copied from), so it had the same latent blowout bug.

**Files Modified:**
- `frontend/apps/store/src/modes/fnb/checkout/components/FnbCheckoutFulfillmentChoices.jsx`

---

## 20. Drop order-type/schedule choices to a single column below a width threshold; final layout: Order Type full row, Schedule below it

**Reason:** Even after items 16/19, the 2-column button pairs still truncated words at narrow widths and, on desktop, when squeezed into a half-width section next to the order summary sidebar. Iterated twice: first to `repeat(auto-fit, minmax(150px, 1fr))` (fluid single-column fallback below a natural width threshold), then further simplified per explicit instruction so the "Order Type" section always occupies the full row and "When would you like your order?" always renders below it — on both mobile and desktop, for both trees.

**Files Modified:**
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleOrderMethodSelector.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutFulfillmentChoices.jsx`
- `frontend/apps/store/src/modes/fnb/checkout/components/FnbCheckoutFulfillmentChoices.jsx`

---

## 21. Add payment details to MSME's Payment step

**Reason:** MSME's payment-type dropdown offered 5 options (Cash/GCash/Maya/Card/Bank transfer) with no supporting copy, unlike F&B which offers only cash today plus a "Pay with cash when your order arrives" info box and an inert "Online payment — Coming soon" placeholder. Trimmed MSME to cash-only and replicated both info boxes — the cash-info box via the already-shared `PaymentMethodSelectorBlock` primitive, and the online-payment placeholder as MSME's own new local component (not imported from F&B).

**Files Modified:**
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutPaymentStep.jsx`
- `frontend/apps/store/src/modes/simple/checkout/pages/SimpleCheckoutRoutePage.jsx`

---

## Full file index

Each file below is annotated with **why** it changed — the item number(s) from the numbered list above where that reason is explained in full.

### Modified
- `frontend/apps/store/src/StorefrontApp.jsx` — why: wires the cart-drawer-auto-open fix (#3), the new MSME desktop summary's props (#9), the new MSME mobile summary panel's props (#11), and the new saved-addresses modal's open/close state (#12); a routing/state hub, not a visual change itself.
- `frontend/apps/store/src/shared/hooks/useCartMutations.js` — why: the shared `addToCart` handler's drawer-auto-open condition wrongly included MSME (`!isFnbMode`); narrowed so only the intended mode opens the drawer automatically (#3).
- `frontend/apps/store/src/shared/components/checkout/SelectableOptionCard.jsx` — why: this shared leaf primitive's label had no text-truncation styling, which only became visible once the grid-blowout bug (#16) was fixed and long labels had to actually fit in a real column width.
- `frontend/apps/store/src/modes/simple/checkout/pages/SimpleCheckoutRoutePage.jsx` — why: touched across most of the session — header wiring (#1, #2, #6), the two-tier full-width/centered-1240px layout restructure (#7, #8), wiring the new desktop summary (#9), wiring the new mobile summary panel (#11), wiring the item-list rewrite (#14), and adding payment-step copy (#21).
- `frontend/apps/store/src/modes/simple/checkout/hooks/useSimpleCheckoutRouteProps.js` — why: threads the new desktop summary's data (#9), the new mobile summary panel's data (#11), and the saved-addresses modal's state (#12) down from `StorefrontApp.jsx`.
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutStoreHeader.jsx` — why: originally left with undeclared prop references from a hand-port, causing a render-breaking `ReferenceError` (#1); font/weight then matched to F&B's (#2); had to be reimplemented once after an accidental revert (#6).
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCartFloatingButton.jsx` — why: its `z-index` sat above the "Added products" drawer instead of being covered by it, so the FAB stayed visible on top when the drawer was open (#4).
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutCustomerStep.jsx` — why: dropped its now-redundant in-card mobile Back/Continue row once the floating mobile summary footer (#11) provided its own (#15).
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutFulfillmentStep.jsx` — why: same redundant-mobile-buttons cleanup as above (#15); also wired the new saved-addresses modal's open/close state and subtitle switching (#12).
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutSavedAddressSelector.jsx` — why: had no mobile-compact branch (single active address + "View All Saved Addresses" button) — added to match F&B's mobile layout (#12).
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutPaymentStep.jsx` — why: added the cash-info box and inert "Online payment — Coming soon" placeholder, and trimmed the payment-type list to cash-only to match F&B's current policy (#21).
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutPaymentActions.jsx` — why: dropped its now-redundant in-card mobile action row (#15).
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutReviewItemsList.jsx` — why: rewritten to add thumbnails and a "YOUR ITEMS" heading, matching F&B's row layout instead of a bare name×qty—price list (#14).
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleOrderMethodSelector.jsx` — why: its bare `gridTemplateColumns: '1fr 1fr'` caused a grid blowout that pushed the whole mobile page wider than the viewport (#16); layout then further simplified to a single full-width row per explicit instruction (#20).
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutFulfillmentChoices.jsx` — why: same grid-blowout root cause and fix as above (#16, #20).
- `frontend/apps/store/src/modes/fnb/checkout/pages/FnbCheckoutRouteContainer.jsx` — why: fixes a hand-port syntax/reference error in the journey header (#5), adds a section title to the special-instructions field that previously rendered untitled (#13).
- `frontend/apps/store/src/modes/fnb/checkout/components/FnbCheckoutJourneyHeader.jsx` — why: a hand-port from MSME left a duplicate `const steps` declaration (syntax error), a reference to a removed prop, and undefined color constants copied from MSME instead of F&B's own themeable brand props — all fixed (#5).
- `frontend/apps/store/src/modes/fnb/checkout/components/FnbCheckoutMobileSummaryPanel.jsx` — why: was missing the big total, Fulfillment/Schedule/Items status rows, and the promo-code prompt that the desktop summary already has — added so mobile and desktop show the same information (#10).
- `frontend/apps/store/src/modes/fnb/checkout/components/FnbCheckoutCustomerStep.jsx` — why: hid its title/description on mobile behind a responsive check, unlike MSME's always-visible bordered card with a numbered title — made consistent (#18).
- `frontend/apps/store/src/modes/fnb/checkout/components/FnbCheckoutFulfillmentStep.jsx` — why: same mobile title/description/border visibility fix as above, plus this step additionally dropped its border/padding entirely on mobile — restored (#18).
- `frontend/apps/store/src/modes/fnb/checkout/components/FnbCheckoutPaymentStep.jsx` — why: same mobile title/description visibility fix (#18); title renamed to "Step 3: Review & Payment" with an added description line to match MSME's wording.
- `frontend/apps/store/src/modes/fnb/checkout/components/FnbCheckoutFulfillmentChoices.jsx` — why: this file was the original source of the bare `'1fr 1fr'` grid pattern that MSME's version had been copied from, so it carried the same latent blowout bug — fixed identically (#19), then simplified to the same single-column layout (#20).

### Created
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutSummaryContent.jsx` — why added: MSME's order summary only showed a title/amount/status; this new component brings the big total, Fulfillment/Schedule/Items rows, itemized cart list with images, promo-code prompt, and "Secure & Private" trust card that F&B's summary already has (#9).
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutMobileSummaryPanel.jsx` — why added: MSME had no mobile-specific bottom-sheet/floating-footer summary at all (the full desktop card just rendered inline); this is MSME's own dedicated equivalent of F&B's mobile panel, teal-branded and adapted to MSME's step numbering — not a shared component, by design (#11).
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutSavedAddressesModal.jsx` — why added: MSME had no bottom-sheet equivalent of F&B's "Saved Addresses" modal; this is MSME's own version (#12).

### Deleted
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutSummaryCard.jsx` — why deleted: fully superseded by `SimpleCheckoutSummaryContent.jsx` (#9) — no remaining references once the rebuild was wired in.
