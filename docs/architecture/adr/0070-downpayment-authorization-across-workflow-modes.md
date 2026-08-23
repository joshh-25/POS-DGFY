---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-08-21
last_reviewed: 2026-08-22
review_by: 2027-02-21
applies_to: retail_storefront, payments, checkout
topic: downpayment_authorization_across_workflow_modes
supersedes: 0069-retail-downpayment-multi-method-capture-and-refund-policy.md
---

# ADR 0070: Downpayment Authorization Across Workflow Modes

## Status

Accepted (2026-08-21). This ADR supersedes ADR 0069.

## Context

> **Strictness tiers (ADR 0039).** Clauses below are tagged `[binding]`, `[default]`,
> or `[snapshot]`. `binding` needs a superseding ADR to change; `default` needs an
> amendment block in the implementing PR; `snapshot` is documentation and may be
> updated by ordinary work. Untagged clauses elsewhere in this document are `default`.

ADR 0068 (accepted 2026-08-21), superseded same-day by ADR 0069, authorized Retail downpayment
capture and — in clause 6, `[binding]` — scoped authorization to Retail only: *"This decision does
not extend to F&B, Services, or Hospitality."* ADR 0069 restated that clause verbatim without
re-examining it. Phase 138 (#820, PR #832, merged 2026-08-21) then shipped it as live code: a
`422 WORKFLOW_MODE_NOT_RETAIL` rejection on any attempt to configure `payment_mode =
downpayment_required` outside a Retail-classified tenant.

That scope was a mistranslation of actual product intent. In the 2026-08-21 planning session that
produced epic #815, Pat's direction was that Retail (Surebiz) is the **priority and first customer**
— the vertical the mechanism is optimized for and proven against first — not the boundary of who
may use it. His own framing named F&B as a target use case in the same session ("making sure the
orders are not bogus, if we don't accept direct cash on delivery"), and epic #815's own Business
Drivers section already records the mechanism as "designed to be vertical-agnostic." Confirmed
directly, 2026-08-21: *"I mean that downpayments is to work for Retail for the sake of Surebiz, I
only meant that we build it in a way that's optimized for Retail, but it DOES NOT MEAN that it's
only for retail, and other industries don't support it now... I personally rather allow downpayments
to any industry as soon as now."* This ADR corrects the authorization scope to match that intent,
approved by Pat as tech lead in this same session per the process below.

**Why the Retail-only fence existed at all** — ADR 0068's own Context, read in full: it declined to
reach into other verticals because two of them already had ADRs gating this exact class of change
(new DB column, new API contract, new config surface) for their own domains — **Services** (ADR
0057 clause 3, `[binding]`: Services checkout "may not reach any database column, API contract, or
Store Profile section until a superseding or amending decision says otherwise") and **Hospitality**
(ADR 0041: "payment collection remains property/POS-owned until a later payment-adapter ADR
introduces online card authorization"). That reasoning is real for those two verticals specifically.
**F&B was swept into the same fence by generalization, not by its own gate** — ADR 0019 (F&B mode,
`amended`, authoritative) contains no payment-collection deferral of any kind, and ADR 0068's Context
cites none for it. Neither ADR 0068 nor ADR 0069 re-examined that inclusion before restating it.

**Why widening is cheap for most of the platform.** `storefront` is a **universal** capability
module (`packages/shared-constants/src/capabilityModules.js`, `group: 'universal'`), not scoped to
any one workflow mode. Every mode that sells through the online store — Retail, F&B, MSME, and any
other mode with `storefront` enabled — already runs the identical shared checkout resolution
(`resolveCheckoutContext`, `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`). Widening
authorization to those modes costs one deleted vertical check in
`downpaymentSettingsUseCases.js` — no schema change, no migration, no new code path.

**Why Services and Hospitality are a genuinely different case, not the same fix.** Services
bookings (`ServiceBooking`, its own `prepaid`/`postpaid`/`deposit` `payment_timing` enum) and
Hospitality reservations (folio-based, ADR 0041) run entirely separate checkout flows that never
call `resolveCheckoutContext` at all. Authorizing them is correct and now matches intent; **making
them functionally capable of it is separate wiring work**, already tracked for Services at #812.
Treating "authorized" and "wired" as the same thing here would grant a capability the code cannot
yet deliver — this ADR keeps them distinct on purpose (see clause 7).

**Separately, Pat has flagged that Hospitality's ongoing inclusion as a peer "DGFY-native niche" in
scoping conversations like this one is itself a drift worth correcting — the platform's own workflow-
mode engine classification already marks Hospitality `'transitional'`, i.e. planned to move to a
sister app rather than be a permanent native vertical. That is out of scope for this ADR and is
tracked separately at #834; this ADR treats Hospitality only as "not yet wired," consistent with
#812's existing treatment of Services, and does not take a position on Hospitality's longer-term
platform placement.**

## Decision

Clauses 1-5 and 8-10 of ADR 0069 are **carried over unchanged, verbatim**, and are not restated
here — see ADR 0069 for their text. Only clauses 6 and 7 are replaced; one new clause is added.

6. **Authorization is not vertical-scoped — it applies to every workflow mode.** `[default]`
   Downpayment (`payment_mode = downpayment_required`) may be configured and used by any tenant,
   regardless of `workflow_mode`. Retail (Surebiz) remains the reference implementation and first
   production customer — the vertical the mechanism was designed and tested against first — not an
   authorization boundary. This clause explicitly resolves ADR 0057 clause 3 and ADR 0041's existing
   deferrals as **not blocking this authorization**: neither ADR gates downpayment as a concept;
   each gates its own vertical's checkout/booking surface, which this decision does not modify or
   reach into. Tiered `[default]` deliberately — if a future concern requires narrowing this again,
   that should be an ordinary dated amendment, not another supersession.
7. **Enforcement is reframed from vertical-scope to reachability.** `[binding]` The backend must
   never present or honor a downpayment configuration on a checkout flow that is not wired to
   compute and capture it. Today, the shared storefront checkout
   (`resolveCheckoutContext`/`buildStoreCartQuoteUseCase`/`buildStoreCheckoutUseCase`) is the one
   wired flow, and it serves every workflow mode with `storefront` enabled — Retail, F&B, MSME, and
   others — uniformly, with no per-mode branching. Services bookings and Hospitality reservations
   run separate, unwired flows and must not silently present or honor `downpayment_required` fields
   until each is deliberately wired (Services: #812). This keeps ADR 0069 clause 7's fail-closed
   intent — never silently honor what the code cannot actually enforce — while removing its
   Retail-only premise, which was the actual defect.
11. **Disposition of what already shipped under the old scope.** `[snapshot]` Phases 136-138
    (#818-#820) shipped and merged under ADR 0069's Retail-only gate, including a live
    `422 WORKFLOW_MODE_NOT_RETAIL` rejection in `downpaymentSettingsUseCases.js`. That gate is
    removed by this ADR's own implementing phase (#833). No data migration is required: the gate was
    a write-time rejection, never a stored value — no existing `tenant_downpayment_settings` row
    encodes the old restriction, so there is nothing to backfill or reinterpret.

## Consequences

- **Positive.** Authorization now matches actual product intent instead of an unreviewed
  generalization from a two-vertical gate. F&B, MSME, and every other `storefront`-enabled mode gain
  downpayment capability at zero implementation cost, since they already share Retail's checkout
  code path. The Retail-only assumption is removed from four places at once (ADR text, use-case
  code, its test, and epic #815's Definition of done) rather than left to drift further.
- **Negative / deferred.** Authorization now exceeds functional capability for two verticals:
  Services and Hospitality are authorized but not wired, and remain so until their own checkout/
  booking flows are extended (#812 for Services; Hospitality has no such ticket yet and is out of
  this ADR's scope). Every deferral ADR 0069 already carried forward — the second-online-charge
  prohibition, the fiscal/VAT deferral to ADR 0042, the provisional fee-basis (#817), the
  unconstructed `customer_choice` mode, unresolved card capture (#477) — is unchanged by this ADR.
- **Reversible.** This is a widening of an authorization boundary with no schema or migration
  impact; narrowing it again, if ever needed, is an ordinary dated amendment under clause 6's own
  `[default]` tier.

## Amendments

### 2026-08-22 — `customer_choice` is lifted from reserved to built

- Clause amended: **Consequences item 2** (untagged, and outside the `## Decision` list — so
  `default` tier per ADR 0039). That item listed *"the unconstructed `customer_choice` mode"* among
  the deferrals this ADR carried forward unchanged from ADR 0069.
- Change: `customer_choice` — a schema-authorized `payment_mode` literal since Phase 138 (#820),
  previously rejected outright by `downpaymentSettingsUseCases.js` with a 422 — is now a fully
  supported settings-level mode. A tenant configured `customer_choice` presents the customer, at
  checkout, with exactly two options: pay the full order total online, or pay a downpayment online
  with the balance settled on delivery/pickup (COD). The customer's election is carried as a new
  `payment_election` request field (`'full'` | `'downpayment'`, default `'full'`), consulted by
  `downpaymentPolicy.js`'s `resolveDownpaymentForTotal` **only** when the tenant's stored
  `payment_mode` is `customer_choice` — ignored (and irrelevant) for `full_payment` and
  `downpayment_required`, whose resolution is unchanged by this amendment.
- Scope this amendment does **not** touch: clauses 6 and 7 (vertical-agnostic authorization,
  reachability-scoped enforcement) are unaffected — `customer_choice` runs through the same shared
  `resolveCheckoutContext` every other mode already uses, with no new checkout flow and no new
  reachability question. Plain COD with no downpayment at all remains expressible as
  `full_payment` plus a cash capability; `customer_choice` does not add a third customer-facing
  option beyond the two named above.
- Reason: the reservation existed because the mechanism wasn't built yet, not because of an
  unresolved design question — once the merchant-configuration UI (#848/#859) and the underlying
  split math were live, the only missing piece was a customer-facing choice between the two modes
  the platform already supports individually. Filed as #866 from hands-on feedback on the Phase 143
  settings UI, once the reservation's own rationale (nothing to choose between yet) no longer held.
- PR: #865/#866 (Phase 150). Issues: #865 (settings-form clarity, shipped in the same PR, no ADR
  clause of its own), #866 (this amendment).

### 2026-08-22 — refund-vs-forfeiture is scoped by who ended the order, not only by the toggle

- Clause amended: **ADR 0069 clause 8** (`[default]`), which this ADR carries forward verbatim
  rather than restating — *"Whether a customer cancellation forfeits the collected downpayment or
  refunds it is a per-store toggle, defaulting to refundable."* Recorded here, not on ADR 0069,
  because that document is `status: superseded` / `authority_level: historical` and `AGENTS.md`
  forbids citing it for a new decision; this ADR is the authoritative carrier of that clause.
- Change: clause 8 says *whether* a cancellation may forfeit, but never defines what counts as a
  *customer* cancellation — and `cancelled` is reachable from two different actors. That is now
  settled explicitly:
  - A **store-initiated** terminal state — `rejected`, or `cancelled` set by staff through
    `PATCH /pos/orders/:id/status` — **always refunds the captured downpayment**, regardless of the
    store's own `downpayment_refundable` setting.
  - Only a **customer self-service** cancellation, through
    `PATCH /store/orders/:tracking_pin/cancel`, may forfeit, and only when the policy snapshot
    taken at capture time (`commerce_payment_sessions.downpayment_refundable`, Phase 141) is
    explicitly `false`. A null/unknown snapshot refunds.
  - The decision reads the **session snapshot**, never the tenant's live settings row, so a
    merchant flipping the toggle after the customer has already paid cannot retroactively change
    the terms that customer accepted.
- Reason: the store's inability to fulfil is not the customer's forfeiture. Without this scoping,
  a store that rejects its own order at a non-refundable-downpayment tenant would keep money for an
  order it declined to supply — the reading clause 8 permits on its face but plainly did not
  intend.
- Known limitation, accepted deliberately rather than left implicit: a customer who phones the
  store and has staff cancel on their behalf is recorded as store-initiated and is therefore
  refunded. Attributing that intent requires an explicit origin field on the POS status payload;
  it is not built, and the safe direction (refund) is the one that fails open for the customer.
- Scope this amendment does **not** touch: clauses 6, 7, and 11 are unaffected, and the *amount*
  refunded is unchanged — ADR 0069 clause 1b `[binding]` already fixes it at the captured
  downpayment, never the order total.
- PR: #824 (Phase 144). See also the companion amendment on ADR 0052, which owns the
  provider-call side of the same behaviour.

## Related

- ADR 0069 (Retail Downpayment — Multi-Method Capture, Refund Policy, and Fee Basis) — superseded by
  this ADR. Its clauses 1-5, 8-10 are carried over unchanged; clauses 6-7 are replaced; clause 11 is
  new.
- ADR 0068 (Retail Downpayment / Payment-Capture Authorization) — superseded by ADR 0069, the
  original source of the Retail-only fence this ADR corrects.
- ADR 0057 (Services Fulfillment Profiles) clause 3, ADR 0041 (Hospitality Mode PMS And Stay
  Management) — the two verticals whose own gates are confirmed unaffected by this widening (clause
  6), and whose checkout/booking flows remain unwired to downpayment (clause 7).
- ADR 0019 (Food & Beverage Mode Full-Service Restaurant Workflow) — confirmed to carry no
  payment-collection gate; F&B's original inclusion in ADR 0068's fence had no citable basis.
- ADR 0039 (Cross-Boundary Decision Strictness Tiers) — governs this ADR's own supersession
  requirement for clause 6/7 (both `[binding]` in ADR 0069) and the tiering of clauses 6/7/11 here.
- #273 — the feature this correction affects. #815 — the epic whose Definition of done is amended
  alongside this ADR. #812 — Services' own downpayment wiring, explicitly deferred, not authorized-
  and-blocked, by clause 7. #833 — the implementing phase for this ADR. #834 — the separate,
  out-of-scope audit of Hospitality's broader platform placement, referenced in Context but not
  decided here. #816, #817, #477 — deferred concerns carried unchanged from ADR 0069.
