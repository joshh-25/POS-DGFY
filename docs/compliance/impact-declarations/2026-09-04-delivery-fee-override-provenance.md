---
status: reference
owner: engineering
last_reviewed: 2026-09-04
related_adr: docs/architecture/adr/0012-dgfy-global-convenience-fee-and-ui-brand-separation.md (the
  2026-09-02 amendment's persisted-override clause, corrected by a dated 2026-09-04 amendment in
  this same PR -- untagged amendment prose, so ADR 0039's cheapest matching path is an Amendments
  block on the existing ADR, not a superseding one); docs/architecture/adr/0078-customer-delivery-fee-modes.md
  (Decision 4 [default], single storefront choke point -- consumed unchanged, not amended: this PR
  deliberately does NOT add an override input to resolveStoreDeliveryFee)
declaration_id: 2026-09-04-delivery-fee-override-provenance
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.09.04
verification_evidence: apps/dgfy-api/tests/posDeliveryFeeOverride.usecase.test.js -- actually executed (Jest) 19/19 passing (12 pre-existing + 7 new #1564 cases: the invariant regression itself; base/waiver/mode/calc_version left untouched as pre-override provenance; a waive-to-free override persisted as 0 and never NULL; an override on a POS-created delivery order with no storefront breakdown; the pre-#1564 provenance-only repair with zero money movement; retry idempotency after a repair; and a fail-loud INTERNAL_ERROR when persistence silently drops the delivery_fee_override write),full delivery-fee suite -- actually executed (Jest) 11 suites / 169 tests all passing via `npm test -- --testPathPatterns='[dD]elivery[fF]ee'` (includes storeCheckoutDeliveryFeeThreeEntryPointConsistency.unit.test.js and storeCheckoutDeliveryFeePin.unit.test.js UNMODIFIED -- the two suites that assert the override-IS-NULL half of the invariant and the pin's own null-vs-zero overrideAmount validation),storefront/POS money regression -- actually executed (Jest) via `npm test -- --testPathPatterns='(storeCheckout|storeCart|storePayment|posDelivery|posCashRefund|storeUsecases)'` all passing (storeUseCases.js is comment-only in this diff; this run is the evidence, not an assertion),node --check on every changed apps/dgfy-api .js file (5 files 0 errors -- dgfy-api has no build step so this is its Tier 0 equivalent per .agents/skills/implement/SKILL.md),npm run check:compliance -- confirmed to fail first (naming exactly posHandlers.js/deliveryFeeOverrideUseCases.js/storeUseCases.js as the 3 sensitive files with no declaration) then pass once this declaration was added,npm run check:architecture -- passed,npm run lint:docs -- passed (includes the new ADR 0012 amendment)
rollback_note: Revert this PR's diff. No migration and no schema change -- pos_transactions.delivery_fee_override already exists (Phase 237, migration 20260903000001-add-delivery-fee-breakdown.cjs); this PR only starts writing a column that was already there and already nullable-with-NULL-default. Reverting stops that write; rows written while it was live keep a delivery_fee_override value that is simply ignored again by every reader, and no money column (delivery_fee, total_amount, balance_due) changes value on rollback because the override amount always equals the delivery_fee it explains. The one behavior that disappears on revert is the in-place repair path for pre-#1564 rows, which is a capability loss, not a data loss.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-04T06:10:00.000Z
preflight_request_ref: NOT-EXECUTED-1564-DELIVERY-FEE-OVERRIDE-PROVENANCE
---

# Delivery-fee override provenance (Phase 281, #1564)

## Compliance Impact Classification

**Major.** The floor is mechanical: `scripts/check-compliance-impact.js`'s
`COMPLIANCE_SENSITIVE_RULES` matches `apps/dgfy-api/src/modules/pos/` to `pos`/`terminal` at a
`major` floor and `apps/dgfy-api/src/modules/store/` to `payments` at the same floor. Confirmed
live by running `npm run check:compliance` against this diff before this file existed — it failed
and named exactly three sensitive files: `modules/pos/controllers/posHandlers.js`,
`modules/pos/usecases/deliveryFeeOverrideUseCases.js`, and `modules/store/usecases/storeUseCases.js`.
`models/PosTransaction.js` is in this diff but is **not** in the rule set and adds no floor of its
own; it is listed under Affected Surfaces for completeness, not because the guardrail matched it.

`major` is also substantively correct independent of the floor: this diff changes what a
`pos_transactions` row *asserts about its own money*. It adds no new money value, but it makes the
difference between "the delivery-fee formula produced this number" and "staff corrected this
number" readable from the columns for the first time, on a fee that feeds `total_amount`.

`regulatory` is not reached — nothing in this diff touches `modules/compliance/` or
`middleware/compliancePolicy.js`.

`reason_codes_impacted: ALLOWED` — no reason code is added, removed, or changed. Every existing
refusal (`DELIVERY_FEE_OVERRIDE_NOT_A_DELIVERY_ORDER`, `POS_TRANSACTION_VOIDED`,
`DELIVERY_FEE_OVERRIDE_PAYMENT_SETTLED`, `DELIVERY_FEE_OVERRIDE_NEGATIVE_TOTAL`) is untouched, and
this PR introduces none.

## The defect

Phase 237 (#1329) added five money-provenance columns to `pos_transactions`
(`delivery_fee_mode`/`base`/`waiver`/`override`/`calc_version`) and documented the invariant on the
model: `delivery_fee_base - delivery_fee_waiver === delivery_fee` whenever `delivery_fee_override
IS NULL`.

Phase 238 (#1330) shipped the staff override against the flat `delivery_fee` column only. It writes
`delivery_fee`, `total_amount`, and `balance_due`, and **never writes `delivery_fee_override`**. So
every override applied since then produced a row where the documented arithmetic no longer holds
*and* the column that exists to explain exactly that reads `NULL` — i.e. the row claims the formula
produced a number the formula cannot produce, with no signal anywhere in the columns. Any reader
trusting the invariant (reconciliation, reporting, a future recompute) gets a wrong or
unexplainable number and no way to tell an override is the reason.

Nothing was mis-charged: the money the customer owes was always the persisted `delivery_fee` and
`total_amount`, both of which were correct. What was missing is provenance, and with it the ability
to distinguish a formula result from a staff correction after the fact.

## Affected Surfaces

1. `apps/dgfy-api/src/modules/pos/usecases/deliveryFeeOverrideUseCases.js` — the fix. The update
   payload now also writes `delivery_fee_override: <the requested absolute fee>`; the post-write
   verification asserts **both** the money and the provenance landed (a persistence layer that
   silently dropped the column — an unknown attribute, a tenant DB still missing the Phase 237
   column — would otherwise reproduce this exact bug silently); the audit row's `changes` payload
   carries `previous_delivery_fee_override`/`new_delivery_fee_override`/`provenance_only`; and the
   success response exposes the same three fields.
2. `apps/dgfy-api/src/modules/pos/controllers/posHandlers.js` — the response `message` becomes a
   three-way branch, so a provenance-only write is not reported as either "overridden" (overstates
   a no-money change) or "unchanged" (hides a real, audited write). Response shape and status codes
   are unchanged.
3. `apps/dgfy-api/src/models/PosTransaction.js` — comment only. Restates the invariant with both
   halves explicit (see Precondition 1).
4. `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` — **comment only, zero behavior
   change.** Records the resolved design decision at the exact line
   (`const overrideAmount = null`) where a future reader will look for it.
5. `docs/architecture/adr/0012-...md` — dated `## Amendments` block correcting the 2026-09-02
   amendment's statement of fact about the persisted write, and restating the two-part invariant.
6. `apps/dgfy-api/tests/posDeliveryFeeOverride.usecase.test.js` — 7 new cases plus provenance
   assertions folded into the existing ones (see Verification Evidence).

## The design question #1564 required to be answered, not assumed

**Does `resolveStoreDeliveryFee` need to accept an override as a resolve-time input?** **No — the
post-hoc-only model is correct, and this is a settled decision, not a deferral.** Four reasons,
recorded here and in the ADR 0012 amendment rather than left implicit:

1. **There is no quote to feed it into.** The override applies to an already-persisted
   `pos_transactions` row, after checkout has completed. `resolveStoreDeliveryFee` runs at cart
   quote, checkout, and payment-session creation — all strictly before that row exists. At resolve
   time no override exists yet, *by definition*, so `overrideAmount: null` is the truthful value
   rather than a stub awaiting a source.
2. **It would break the resolver's own stated contract.** That function is documented I/O-free and
   `await`-free specifically so `deliveryFeeModeConfig.checkoutFallback.unit.test.js` and
   `storeCheckoutRoadDistanceCapture.unit.test.js` can pin fixed-mode byte-identity. Reading a
   persisted transaction is I/O.
3. **It would add a second writer to a deliberate single choke point** — ADR 0078 Decision 4
   `[default]` makes `resolveStoreDeliveryFee` the sole storefront fee-resolution entry point. The
   staff override is a POS/back-office correction on an existing order; routing it through the
   storefront resolver would conflate two different lifecycles.
4. **`overrideAmount` is not dead weight in the breakdown.** It is the shape the persisted column
   mirrors, and `isValidPinnedDeliveryBreakdown` already validates it on the quoted-fee pin
   read-back path with the null-vs-zero distinction intact (PR #1377 RF-2). Removing it would be
   the wrong correction.

Not to be confused with `locationOverride`, the resolver's other "override"-named parameter — that
is per-**location** fee *configuration* (ADR 0078 Decision 6 `[binding]`, divergence tracked in
#1346), an unrelated axis this PR does not touch.

## Compliance Preconditions

1. **The invariant is explicitly redefined, not quietly relaxed.** Both halves now hold and both
   are stated on the model:
   - `delivery_fee_override IS NULL` → `delivery_fee_base - delivery_fee_waiver === delivery_fee`
     (unchanged from Phase 237).
   - `delivery_fee_override IS NOT NULL` → `delivery_fee === delivery_fee_override`, with
     `delivery_fee_base`/`delivery_fee_waiver` **retained as the pre-override provenance and
     deliberately no longer reconciling**. This is ADR 0012's existing "an override, when present,
     replaces that result outright rather than adjusting it", stated on the persistence side.
   Pinned by a test helper (`expectDeliveryFeeInvariant`) that every relevant case runs, so no test
   can assert only the convenient half.
2. **No money value changes.** `delivery_fee`, `total_amount`, and `balance_due` are computed
   exactly as before — the delta-adjusted total, the `DELIVERY_FEE_OVERRIDE_NEGATIVE_TOTAL`
   fail-loud guard, and PR #1336 RF-1's `balance_due`-stays-0-on-an-unpaid-order rule are all
   untouched and still covered by their original regression tests. The override amount written is
   *by construction* the same number already being written to `delivery_fee` (this endpoint takes
   an absolute target, never a delta), so provenance and money cannot drift apart via a second
   computation.
3. **The null-vs-zero distinction is preserved.** `round4()` alone collapses `NULL` to `0`
   (`Number(null) || 0`), which would conflate "no override" with "staff set it free". Every read
   of the column goes through a `round4OrNull()` helper instead. Pinned by a dedicated
   waive-to-free test asserting the persisted value is `0` and explicitly not `null`.
4. **Every existing refusal gate is unchanged**, and so is the settled-payment boundary: this path
   is still reachable only while `payment_status === 'unpaid'`, still refuses non-delivery orders
   and voided transactions, still requires the `pos:delivery_fee_override` permission on the route
   and a ≥3-character reason. No refund/top-up machinery is introduced, matching #1330's scope
   boundary.
5. **The no-op branch is narrowed, and retry idempotency is preserved exactly.** A resubmit is a
   no-op only when the money *and* the provenance column are already at the target. A genuine retry
   of a successful override always satisfies both (the first call wrote the override), so the
   idempotency property #1330 declared is unchanged — pinned by a test that submits twice and
   asserts exactly one audit row. The one newly-writing case is a row whose `delivery_fee` already
   matches but whose `delivery_fee_override` is `NULL`; that write moves no money at all
   (`feeDelta === 0`, `total_amount`/`balance_due` written back at their existing values) and only
   stamps provenance.
6. **Pre-#1564 rows are repairable in place, without a backfill.** ADR 0012 is forward-only (no
   historical recompute), so rows overridden before this fix keep a silently violated invariant
   forever unless something repairs them. Precondition 5's provenance-only path is that repair: it
   runs through the same permissioned, reasoned, audited endpoint, is distinguishable in the audit
   log via `provenance_only: true`, and cannot change a single money value. No migration, no data
   patch, no ad-hoc SQL.
7. **The write is asserted, not assumed.** The post-write check now fails
   `INTERNAL_ERROR` if `delivery_fee_override` did not land, alongside the existing `delivery_fee`
   check. Pinned by a test that simulates a repository silently discarding the column.
8. **Still no frontend entry point.** #1330's Precondition 7 stands — the endpoint remains
   API-only; `packages/web-core` carries only the permission mirror. That is why the narrowed no-op
   in Precondition 5 has no live client to affect, stated as fact (confirmed by grep across
   `apps/dgfy-pos`, `apps/dgfy-ims`, `packages/web-core`) rather than assumed.

## Named limitation, not omitted

POS cashier checkout (`posUseCases.js`) writes `delivery_fee: 0` and never populates the Phase 237
breakdown columns, so POS-created orders sit at the column defaults (`fixed`/`0`/`0`/`NULL`/`1`).
That satisfies the invariant's first half trivially (`0 - 0 === 0`) rather than violating it, and an
override applied to such an order is covered here by its own test case. It is named because a
reader could otherwise expect `delivery_fee_base` to carry meaning on every delivery order; today
it carries meaning only on storefront-originated ones.

## Verification Evidence

See the `verification_evidence` front-matter field for the itemized list. Summary:

- `posDeliveryFeeOverride.usecase.test.js` — **19/19 passing**, up from 12. The 7 new cases are
  the invariant regression itself (fee moves, base/waiver do not, override is recorded, both halves
  of the invariant checked); base/waiver/mode/calc_version left untouched as pre-override
  provenance; the waive-to-free `0`-not-`NULL` case; an override on a POS-created delivery order
  with no storefront breakdown; the pre-#1564 provenance-only repair asserting zero money movement
  and a `provenance_only: true` audit row; retry idempotency across a repair plus its resubmit
  (exactly one audit row); and the fail-loud `INTERNAL_ERROR` when persistence drops the override
  write. The 12 pre-existing cases are retained and extended with provenance assertions, not
  replaced.
- Full delivery-fee suite — 11 suites / 169 tests, all passing. Includes
  `storeCheckoutDeliveryFeeThreeEntryPointConsistency.unit.test.js` and
  `storeCheckoutDeliveryFeePin.unit.test.js` **unmodified** — the two suites that assert the
  `override IS NULL` half of the invariant and the pin's own null-vs-zero `overrideAmount`
  validation. Their passing unchanged is the evidence that this PR redefined the invariant's second
  half without weakening its first.
- Storefront/POS money regression across `storeCheckout*`/`storeCart*`/`storePayment*`/
  `posDelivery*`/`posCashRefund*`/`storeUsecases*`, all passing — the evidence that the
  `storeUseCases.js` edit is genuinely comment-only.
- `node --check` on every changed `apps/dgfy-api` `.js` file; `npm run check:compliance` (fail
  first, pass with this declaration); `npm run check:architecture`; `npm run lint:docs`.

Outstanding before merge:

- **`POST /api/v1/compliance/preflight` has not been executed** — front matter carries
  `NOT-EXECUTED-1564-DELIVERY-FEE-OVERRIDE-PROVENANCE`, which is the expected state for a
  `develop`-targeting PR per `docs/compliance/request-time-preflight-protocol.md`'s "Where live
  preflight actually runs"; the continuous sweep reconciles it post-merge. No authenticated
  `SYSTEM.EDIT_SETTINGS` session against a running backend was available from this session.
- **`npm run gate:release:local` has not been run** — no longer a promotion step at all since
  #1431 Phase C/D, and never `implement`'s job at PR time per `.agents/skills/implement/SKILL.md`.
