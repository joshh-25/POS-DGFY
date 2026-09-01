---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-09-01
last_reviewed: 2026-09-01
review_by: 2027-03-01
applies_to: architecture_decision
topic: customer_delivery_fee_modes
---

# ADR 0078: Customer Delivery-Fee Modes

## Status

Accepted (2026-09-01). The decisions recorded here were settled by Pat on 2026-09-01, in #1321's
body and in #1322's decision comment; this ADR is the governed record of those calls, not a fresh
proposal.

## Context

Epic #1321 covers how a tenant prices customer-facing storefront delivery — a flat rate today, a
distance-calculated rate and a free-delivery mode going forward. Rider/courier compensation is
explicitly out of scope for the epic, full stop; nothing in this ADR governs it.

Today's behavior is a single flat `store_delivery_fee` setting, resolved by
`resolveStoreDeliveryFee` (`apps/dgfy-api/src/modules/store/usecases/storeUseCases.js:529`), with
one call site inside `resolveCheckoutContext`. Road distance is already computed and discarded at
checkout time (`:512-527`, a haversine straight-line calculation) — only an unused
`outside_radius_flag` survives from that work (#478).

This ADR exists because AGENTS.md's Planning Rules require an authoritative doc be cited before an
implementation plan, and no existing ADR covers delivery-fee modes; #1321 names this ADR
explicitly as a prerequisite.

**Context note, not a decision:** `apps/dgfy-api/src/modules/routeCalculator/` (a self-hosted
GraphHopper instance, already in-repo) is the distance provider the calculated branch will call
through an adapter. Neither this ADR nor the epic it governs introduces a new third-party
integration.

Sequencing note, stated plainly rather than smoothed over: Phase 233 (#1324) already merged (PR
#1337) and shipped `store_delivery_fee_mode` / `store_delivery_fee_calc` plus
`modules/deliveryPricing/` ahead of this ADR. This document ratifies the shipped placement and key
naming rather than proposing them cold, and it names one point where the shipped code diverges from
the decision actually recorded (see Decision 5).

This ADR governs fee modes and their resolution inputs only. The waiver axis (ADR 0066 Decision 8),
the totals formula (ADR 0012), and distance-as-a-pricing-input (ADR 0034) each get a dated
Amendments block on their own ADR in their own implementing phase — not restated here.

## Decision

1. **Closed fee-mode enum.** A tenant's customer delivery pricing resolves to exactly one of
   `fixed`, `calculated`, `free`. `provider_quoted` is reserved in the enum namespace and not
   built: no validator, persistence surface, or settings UI may accept it until a superseding ADR
   (or a dated amendment, if this clause has decayed) says otherwise. Any value outside the
   accepted set reaching the fee resolver is a defect, not a variation. `[binding]`
2. **Fail-open-to-fixed on any provider or address failure.** If the road-distance provider is
   unavailable or errors, the delivery address is unresolvable, or the calculated-mode formula
   config is absent or malformed, fee resolution falls back to the tenant's configured fixed rate.
   It never blocks checkout on a provider failure, and never estimates, guesses, or interpolates a
   distance. To disambiguate: exceeding a known max distance is a deliberate hard block at
   self-service checkout (a later phase's own clause, not this ADR's); an unknown distance is a
   fallback — these are different states, not the same failure handled two ways. `[binding]`
3. **A fixed rate must always be configured, in every mode.** `store_delivery_fee` must hold a
   valid value even when `store_delivery_fee_mode` is `calculated` or `free`; settings validation
   must not permit clearing it, and no migration or admin path may leave it null for a
   delivery-enabled tenant. `[binding]`
4. **Module placement.** Customer delivery-fee resolution lives in
   `apps/dgfy-api/src/modules/deliveryPricing/` — pure domain under `domain/`, DI-wrapped use cases
   under `usecases/`, the road-distance adapter (when it lands) under `repositories/`, per the
   module shape `scripts/check-architecture-guardrails.js` enforces and ADR 0001's boundaries. The
   storefront remains a single choke point: `resolveStoreDeliveryFee` in
   `modules/store/usecases/storeUseCases.js` stays the only fee-resolution entry point for the
   storefront checkout path. `[default]`
5. **Settings-key naming and the per-location override seam.** Tenant-level configuration uses the
   `store_delivery_fee*` EAV key family and nothing else: `store_delivery_fee` (existing flat rate,
   meaning unchanged), `store_delivery_fee_mode` (Decision 1's enum), `store_delivery_fee_calc`
   (calculated-mode formula: `min_fee`, `included_km`, `per_km_rate`, `increment_km`,
   `max_distance_km`), and `store_delivery_fee_vatable` (Decision 6). New delivery-pricing
   configuration extends this prefix rather than opening a new namespace. The resolver takes
   `{ tenantSettings, locationOverride }` from day one; `locationOverride` is hardwired `null`
   until a later epic resolves a real per-location source. When a `locationOverride` is present, it
   merges over `tenantSettings` field-by-field on discrete keys — it does **not** replace the
   tenant configuration wholesale (#1322 decision #1). `[default]`
6. **Delivery-fee VAT treatment is per-tenant configuration, on both surfaces.**
   `store_delivery_fee_vatable` (boolean, default per tenant's existing fiscal posture) governs
   whether a waived delivery fee populates the waiver's fiscal columns or leaves them null. It is a
   settings concern, not a fee-resolution input — it never changes which mode resolves or what
   `finalFee` is. Must be readable and writable from both the IMS and POS settings surfaces,
   through the existing settings API (`PUT /api/v1/settings`, `PUT /api/v1/settings/:key`), with no
   new endpoint, matching the #1341 IMS+POS parity precedent. Requiring a POS settings surface does
   not extend the epic's fee-resolution scope, which stays storefront-only (#1322 decision #6).
   Ships under issue #1347. `[default]`
7. **Discovery from-price semantics.** Storefront discovery/search cards advertise a genuine floor
   as "from ₱X": `fixed` → the configured `store_delivery_fee`; `calculated` →
   `store_delivery_fee_calc.min_fee`; `free` → ₱0 / "Free delivery". No distance estimation, no
   provider call. If no floor can be resolved, show no delivery from-price at all rather than a
   placeholder. `[default]`
8. **`provider_quoted` stays reserved-not-built, and this ADR is where it is un-reserved.** No
   courier-API integration ships under this ADR. Introducing `provider_quoted` behavior requires
   either a dated amendment (if Decision 1 has decayed to `[default]` past `review_by`) or a
   superseding ADR while Decision 1 remains `[binding]`. `[default]`

## Consequences

- **Positive.** The #233-family phases now have a citable authoritative doc for AGENTS.md's
  Planning Rules; the closed enum plus mandatory fallback rate make fail-open mechanically
  checkable rather than a matter of convention.
- **Positive.** No new vendor, credential, or outbound dependency — calculated mode rides the
  existing self-hosted GraphHopper module (`modules/routeCalculator/`).
- **Negative / known divergence.** The shipped Phase 233 resolver (`domain/deliveryFeeConfig.js`)
  replaces tenant configuration wholesale via `||` on `locationOverride`, instead of merging
  field-by-field per Decision 5, and its header comment incorrectly attributes that wholesale
  behavior to a recorded decision. There is zero live impact today because `locationOverride` is
  always `null`. Tracked as issue #1346; not fixed in this docs-only PR.
- **Negative / deferred.** `store_delivery_fee_vatable` (Decision 6) does not exist in the settings
  schema yet. Tracked as issue #1347.
- **Ongoing cost.** Three `[binding]` clauses (1, 2, 3) carry a `review_by` renewal obligation per
  ADR 0039 Decision 4; left unrenewed after 2027-03-01 they decay to `[default]`.

## Related

- ADR 0039 (ADR Lifecycle, Strictness Tiers, and Amendment Path) — the tier/process this ADR's
  clauses and future amendments follow.
- ADR 0001 (module boundaries referenced by Decision 4).
- ADR 0034 (distance as a pricing input) — gains a dated amendment in its own implementing phase,
  not here.
- ADR 0066 Decision 8 (waiver axis) and ADR 0012 (totals formula) — each amended in their own
  implementing phases, not here.
- ADR 0017.
- Issues #1321, #1322, #1323, #1324, #1341, #1346, #1347, #478, #625.

## Approval

Pat settled every clause this ADR encodes — epic decisions 1, 4, and 10 in #1321's body, and
decisions #1, #3, #4, and #6 in #1322's 2026-09-01 decision comment. This document is the governed
record of those calls, not a self-certified one.
