---
status: reference
owner: engineering
last_reviewed: 2026-09-02
declaration_id: 2026-09-02-auto-applied-delivery-campaigns
classification: major
surfaces: payments,pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.02
verification_evidence: apps/dgfy-api/tests/autoAppliedCampaignPolicy.unit.test.js -- actually executed (Jest), new, 28 passing (the pure selector: empty/single-candidate, waiver-desc/valid_from-asc/voucher_id-asc ordering incl. null valid_from wins, a 6-permutation input-order-independence proof, one case per filter reason, zero-waiver-not-selected, partial waiver, over-waiver clamp ordered by the CLAMPED value, percent_off-targeting-delivery, missing/invalid context.now throws),apps/dgfy-api/tests/addVoucherAutoApply.migration.test.js -- actually executed (Jest), new, 13 passing (up/down idempotence, column-before-index / index-before-column ordering, missing-table skip, no-tenants-table landlord-only fan-out, sync-tenant-schemas.js DDL-drift guard for both the column and the index, REQUIRED_TENANT_SCHEMA_TABLES.vouchers CREATE TABLE assertion),apps/dgfy-api/tests/storeCheckoutAutoAppliedDelivery.unit.test.js -- actually executed (Jest), modified (RF-1, PR #1397 review: updated four `delivery_voucher_feedback.voucher_code` assertions from the campaign's code to `null`, now that auto-apply never populates that field -- see the response-contract note below), 11 passing (the ticket's own determinism acceptance case -- quote and checkout agree byte-for-byte with no delivery_voucher_code typed, and the winner is independent of candidate-array order; count and peso-budget exhaustion disappearing identically from both paths, with the next-funded campaign auto-applying instead; typed-code precedence over auto-apply with the campaign left untouched, a typed invalid code still failing closed, a typed item voucher and the auto-applied delivery campaign both applying on their two independent axes, idempotent replay, a pickup order never considering auto-apply; fail-open on a simulated exhausted-between-read-and-reserve race -- checkout still succeeds with no waiver and no next-candidate retry),apps/dgfy-api/tests/voucherRedemptionUseCases.usecases.test.js -- actually executed (Jest), unmodified, 32 passing (regression-clean against the extracted deliveryBenefitTranslation.js import -- byte-identical behavior),apps/dgfy-api/tests/voucherUseCases.usecases.test.js -- actually executed (Jest), unmodified, regression-clean against the two new applyBenefitConfig/assertAutoApplyHasNoScope authoring guards,apps/dgfy-api/tests/voucherValidator.test.js -- actually executed (Jest), unmodified, regression-clean against the new auto_apply field,apps/dgfy-api/tests/storeCheckoutDeliveryWaiverDualAxis.unit.test.js -- actually executed (Jest), modified (added listAutoApplyDeliveryCampaigns to its hand-rolled fake voucher repository returning [] by default, and updated one delivery_voucher_feedback assertion for the new auto_applied/label fields -- both required because every delivery order without a typed delivery code now calls the new repository method; the fixture set carries no auto_apply campaign, so the auto-apply branch is provably a no-op throughout this file), 15 passing,apps/dgfy-api/tests/storeCheckoutDeliveryFeePin.unit.test.js -- actually executed (Jest), modified (RF-2, PR #1397 review: added a faked voucherRepository -- module-mocked, same technique as storeCheckoutAutoAppliedDelivery.unit.test.js -- and a new describe block covering a PRESENT `pinnedDeliveryBreakdown.autoAppliedVoucherId` on webhook-finalize: the same pinned campaign is redeemed exactly once with the pinned waiver amount persisted, a competing campaign that would win the selector's own ordering is never touched, and the D2 fail-open case on this specific finalize path -- redemption fails, checkout still succeeds at the pinned fee, no fallback to a different campaign), 29 passing (was 27; every prior case, unmodified, confirms the pin validator's `autoAppliedVoucherId` field stays backward-compatible with a pin that omits it entirely),apps/dgfy-api/tests/storeCheckoutCalculatedDeliveryFee.unit.test.js, storeCheckoutVoucherPromoStacking.unit.test.js, storeCheckoutDeliveryFeeThreeEntryPointConsistency.unit.test.js, deliveryFeeModeConfig.checkoutFallback.unit.test.js -- actually executed (Jest), unmodified, 23 passing across the four (this is the regression class the fail-open-on-query-error design exists for -- see 'What this phase does and does not do'),apps/dgfy-api/tests/posVoucherDiscountCalculator.unit.test.js, storeCheckoutAffiliatePricing.unit.test.js -- actually executed (Jest), unmodified, regression-clean,apps/dgfy-api/tests/tenantSchemaSyncScripts.test.js, checkTenantSchemaRegistryCoverageScript.integration.test.js -- actually executed (Jest), unmodified, 32 passing,full targeted sweep -- actually executed (Jest), `--testPathPattern="storeCheckout|store.*Delivery|voucher|Voucher|migration"`, 629 passing across 54 suites, 0 failing (was 627; +2 from the RF-2 pin tests),node --check on every changed/new .js and .cjs file (this phase has no build step; Tier 0 equivalent per .agents/skills/implement/SKILL.md)
rollback_note: The single new vouchers column (auto_apply, TINYINT(1) NOT NULL DEFAULT 0) and its composite index (idx_vouchers_auto_apply) are additive, defaulted, and cleanly droppable -- this migration has NO enum widening at all (unlike Phase 240's own migration), so down() is a plain guarded index-drop then column-drop with no rollback-blocked-by-live-data case to throw on. Dropping auto_apply reverts every campaign to code-entered-only; no money column is touched and no persisted order is recomputed -- only future auto-apply resolution stops, retroactively nothing. There is no rollback mechanism for the container deploy path (#495 open), unchanged by this phase.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-02T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-1332-AUTO-APPLIED-DELIVERY-CAMPAIGNS
---

# Auto-applied free-delivery campaigns (Phase 244, #1332)

## Compliance Impact Classification

Major. `check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES[1]`
(`/^apps\/dgfy-api\/src\/modules\/vouchers\//`, `surfaces: ['pos','terminal']`,
`minimumClassification: 'major'`) floors this diff for touching `autoAppliedCampaignPolicy.js`,
`deliveryBenefitTranslation.js`, `voucherAutoApplyUseCases.js`, `voucherRepository.js`,
`voucherUseCases.js`, `voucherRedemptionUseCases.js`, and `index.js`.
`COMPLIANCE_SENSITIVE_RULES[2]` (`/^apps\/dgfy-api\/src\/modules\/store\//`, `surfaces: ['payments']`,
`minimumClassification: 'major'`) independently floors it for touching `storeUseCases.js`. Nothing in
this diff touches `modules/compliance/`, `middleware/compliancePolicy.js`, `routes/compliance.js`,
`validators/complianceValidator.js`, `controllers/complianceController.js`, `routes/adminTenants.js`,
or `controllers/adminTenantController.js` — the `regulatory` tier is not reached.

Independent of the mechanical floor, `major` is substantively correct: this diff changes **when a
money column becomes non-zero** (`pos_transactions.delivery_fee_waiver`), now **without any shopper
action at all** — a strictly higher-stakes change than Phase 240's code-entered case, since a
merchant campaign now spends its own budget on every qualifying order automatically.

`reason_codes_impacted: ALLOWED` — this phase introduces **no new reason code**. Auto-apply fails
open on a redemption failure (D2, no waiver, checkout proceeds, no next-candidate retry); the two new
authoring-time guards (§ below) reuse the existing `VOUCHER_BENEFIT_CONFIG_INVALID`. This is a
genuine difference from Phase 240 (which introduced `VOUCHER_BENEFIT_TARGET_MISMATCH`) — not copied
across.

## What this phase does and does not do

Phase 244 of epic #1321 (decision 9) — a delivery-fee campaign can now select and apply itself with
no code typed, on top of Phase 240/241's code-entered mechanism (unchanged, and always wins when a
code is typed — D3).

- One new column, `vouchers.auto_apply` (`TINYINT(1) NOT NULL DEFAULT 0`) — every existing voucher
  stays byte-identical (`0`, code-entered only). `NOT NULL` with an explicit default, same "eligible
  everywhere cannot be produced by omission" property ADR 0066 Decision 10 already requires elsewhere
  (#459). One composite index, `idx_vouchers_auto_apply (auto_apply, status, benefit_target)`,
  covering the one new query shape exactly.
- **The pure selector (`autoAppliedCampaignPolicy.js`) is the entire decision surface**, and it is
  genuinely pure: no I/O, and `context.now` is a required, explicit `Date` — the function throws
  rather than falling back to an ambient clock, specifically so a quote request and a later checkout
  request cannot evaluate a time-boundary campaign differently for no code reason. Called from
  exactly one place in `storeUseCases.js` (`resolveCheckoutContext`), which is itself the single
  funnel every entry point (cart quote, direct checkout, QRPh payment-session creation, webhook
  finalize) already goes through — so quote/checkout divergence is structurally impossible, not
  merely tested. The candidate SQL filter (`voucherRepository.listAutoApplyDeliveryCampaigns`) is
  deliberately minimal (`auto_apply`/`benefit_target`/stored `status` only); every semantic filter
  (date window, time-of-day, weekday, channel, fulfillment, order timing, min spend/quantity,
  exhaustion) lives in the one pure selector so there is only ever one filter implementation to keep
  correct.
- **No caching, anywhere, by design** — a cache between the quote call and the checkout call is the
  single most likely way to reintroduce the divergence this phase exists to prevent. The repository
  method's own doc comment states this as a standing prohibition for future refactors, not just a
  current fact.
- **Fails open on the candidate READ itself, not just the redemption** (a deliberate extension beyond
  the original plan, discovered during self-verification): `listAutoApplyDeliveryCampaigns` is a
  zero-side-effect query, and a transient failure resolving it (the exact failure mode seen against
  every pre-existing store-checkout unit test that has no live database available) must not block an
  otherwise-valid checkout any more than a `roadDistanceProvider` failure already does in this same
  function. Caught, logged at `warn`, treated as "no campaign considered" — checkout proceeds at the
  full delivery fee. This is the mechanism that keeps ~20 pre-existing store-checkout test files
  regression-clean without modification; each of them places a delivery order with no delivery
  voucher code, which now always attempts this query.
- **Auto-apply fails open on a REDEMPTION failure too (D2)**: no waiver, checkout proceeds, no
  retry against the next candidate. Consistent with ADR 0066 Decision 3's entered-vs-empty
  distinction (`voucherRedemptionUseCases.js`'s own module docstring) — the shopper entered nothing,
  so there is nothing to fail closed about. No ADR amendment; this is Decision 3 applied, not
  reinterpreted.
- **Precedence (D3): a typed delivery code always beats auto-apply**, and auto-apply is skipped
  entirely in that case — no budget is burned evaluating it. Structural, not a runtime check: the
  auto-apply branch is an `else if` on the same `orderMethod === 'delivery'` condition, on the same
  `deliveryWaiverApplication` variable, so the two are mutually exclusive by construction, the same
  way the whole `pos_transactions` schema can hold only one delivery-axis waiver at all (ADR 0066
  Decision 8's 2026-09-02 amendment, point 3).
- **v1 auto-apply is delivery-axis only (D4)** — `applyBenefitConfig` (`voucherUseCases.js`) gains a
  guard rejecting `auto_apply: true` on anything but `benefit_target: 'delivery'`; an auto-applying
  ITEM voucher is a separate, larger product decision (it would interact with the single governed
  item-discount slot, ADR 0066 Decision 8) and is explicitly out of scope. A second new guard,
  `assertAutoApplyHasNoScope`, rejects `auto_apply: true` combined with any `voucher_scopes` row —
  the selector never consults scopes (a delivery-targeted benefit has no per-line component by
  construction), so failing closed at authoring time keeps that limitation unreachable rather than
  silently ignored.
- **The QRPh pin gap (D5)** — the pinned delivery-fee breakdown (`commerce_payment_sessions
  .delivery_fee_breakdown`) now also carries `autoAppliedVoucherId`, so the webhook-finalize replay
  redeems the SAME campaign that priced the order at payment-session creation, never re-selecting a
  different (possibly larger, possibly newer) campaign minutes later against a captured amount that
  would no longer match. Backward-compatible: an in-flight pin from before this deploy has no such
  key at all; the validator (`isValidPinnedDeliveryBreakdown`) treats `undefined` as equivalent to
  `null` rather than rejecting the pin outright, and `DELIVERY_FEE_CALC_VERSION` is deliberately NOT
  bumped for this — the fee formula itself is unchanged, only interpretation of one new field.
- **The `delivery_voucher_feedback` response contract changed on both the cart-quote and checkout
  responses** — it now sources its `voucher_code` from `deliveryWaiverApplication
  .enteredDeliveryVoucherCode` rather than echoing `payload.delivery_voucher_code` back, which would
  be empty on an auto-applied order and defeat the ticket's own acceptance evidence ("fee shows as 0
  in the cart drawer" is not useful without saying which campaign did it). **Corrected 2026-09-02
  (RF-1, PR #1397 review):** `enteredDeliveryVoucherCode` is populated (non-null) ONLY on the
  code-entered path and stays `null` on both auto-applied paths (fresh resolution and the pinned
  webhook-finalize replay) — the original version of this diff set it to the campaign's own code on
  auto-apply too, which conflated "the shopper entered this" (what the field is for) with "the server
  auto-selected this campaign." Which campaign applied is still fully recoverable via
  `voucherId`/`autoAppliedVoucherId` (persisted, not on this particular response shape) and the
  additive `auto_applied`/`label` fields the storefront UI (#1391, not built here) uses to render an
  auto-applied campaign distinctly from a typed one.
- **No ADR amendment required** — the 2026-09-02 amendment to ADR 0066 Decision 8 already permits
  exactly one delivery-axis application; this phase changes HOW that one application is chosen, not
  the rule itself. Confirmed no invariant is reopened: the schema still physically cannot hold two
  delivery-axis waivers (one `delivery_fee_waiver_voucher_id` column), and the `else if` structure
  above makes a second one unreachable in code as well.
- Out of scope, per the plan: the storefront/POS merchant-authoring UI checkbox for `auto_apply`
  (handed to `pm` as a follow-up — the flag is fully operable via the admin API today without it);
  auto-applying item-axis vouchers (D4); voucher-to-voucher stacking within one axis (#782, untouched).

## Affected Surfaces

- `pos`, `terminal` — `apps/dgfy-api/src/modules/vouchers/domain/autoAppliedCampaignPolicy.js` (new,
  the pure selector), `deliveryBenefitTranslation.js` (new, extracted translation),
  `usecases/voucherAutoApplyUseCases.js` (new, the thin impure shell),
  `repositories/voucherRepository.js` (`listAutoApplyDeliveryCampaigns`, `listVouchers` filter),
  `usecases/voucherUseCases.js` (writable field, two new authoring guards),
  `usecases/voucherRedemptionUseCases.js` (imports the extracted translation, behavior-identical),
  `index.js` (exports the new use case).
- `payments` — `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` (the auto-apply branch,
  `autoApplied`/`autoAppliedVoucherId` fields, the pin validator extension, the
  `delivery_voucher_feedback` contract fix on both the quote and checkout responses).
- Not compliance-sensitive by the guardrail's own rule set, named anyway for completeness:
  `apps/dgfy-api/src/models/Voucher.js` (new attribute + index), `src/validators/voucherValidator.js`
  (new field), `scripts/sync-tenant-schemas.js` (column/index registry entries and the `vouchers`
  CREATE TABLE fallback), `apps/dgfy-migration-runner/migrations/20260905000002-add-voucher-auto-
  apply.cjs`.

## Compliance Preconditions

- No refund, settlement, capture, or fiscal-document code path is touched. VAT bucketing is
  unchanged.
- The totals formula's *shape* is unchanged:
  `round4(subtotal − promo − voucher + delivery_fee + service_fee)` — the `delivery_fee` term's
  value can now additionally reflect an auto-applied waiver, on top of every prior source of change
  to that term; no term added, removed, or reordered.
- Every order on a tenant with no `auto_apply` campaign configured is byte-identical to pre-244 —
  the fresh SQL query returns `[]`, the selector returns `{selected: null}`, and every existing
  regression suite listed in `verification_evidence` confirms this.
- ADR 0066 Decision 1 `[binding]` (a voucher never mutates a persisted unit price) is preserved by
  construction — the auto-apply selector reuses the exact same `benefitTarget: 'delivery'` arm of
  `voucherBenefitPolicy.js` that Phase 240's code-entered path already uses, unchanged.
- ADR 0066 Decision 8's single-slot invariant is preserved exactly (see "What this phase does and
  does not do" above) — no new discount-slot write path is introduced.
- **Named limitation, not omitted**: the auto-apply selector does not consult `voucher_scopes` at
  all (a delivery-targeted benefit has no per-line component to scope). Made unreachable, not merely
  documented, by the `assertAutoApplyHasNoScope` authoring guard.
- **Named limitation, not omitted**: waiver-reversal-on-cancellation, closed for every voucher kind
  including auto-applied delivery campaigns by the now-merged #1390 (PR #1395,
  `fix/1390-storefront-cancel-voucher-reversal`) — this phase's own dependency on that fix landing
  first (Wave 0 decision #5) is satisfied; no residual exposure is inherited here.
- **Named deviation from the original plan, stated outright**: the plan's own design did not specify
  fail-open behavior for the candidate SQL query itself (only for the redemption). This declaration
  adds it, and the "What this phase does and does not do" section above states why: without it, a
  transient query failure would degrade to a hard checkout failure for every future tenant, which is
  a strictly worse posture than the redemption-level fail-open the plan does specify. No ADR
  amendment needed — this is an implementation-level robustness addition, not a policy change.

## Verification Evidence

See `verification_evidence` in this file's front matter for the full, itemized list of suites and
pass counts actually executed.

## Preflight Reconciliation

`NOT-EXECUTED-1332-AUTO-APPLIED-DELIVERY-CAMPAIGNS` is expected on a PR targeting `develop`, not a
finding — per `docs/compliance/request-time-preflight-protocol.md`, "Where live preflight actually
runs," the continuous sweep (`.github/workflows/compliance-preflight-sweep.yml`) triggers
automatically once this declaration lands on `develop` and reconciles this front matter within
minutes, well before any promotion is cut. No live `POST /api/v1/compliance/preflight` call was made
from this session — no authenticated `SYSTEM.EDIT_SETTINGS` session against a running backend was
available, matching every other `develop`-targeting PR under this protocol.

## Residual Risks

1. **Storefront/POS UI surfaces** — no UI renders `auto_applied`/`label`, or a merchant-facing
   `auto_apply` checkbox. Handed to `pm` as a follow-up issue, not built here; the flag is fully
   operable via the admin API without it.
2. **Auto-applying item-axis vouchers** — explicitly deferred (D4), a separate product decision.
3. **Resolved 2026-09-02 (RF-2, PR #1397 review):** the *present*-`autoAppliedVoucherId` case on the
   `resolveCheckoutContext` webhook-finalize replay branch is now directly tested —
   `storeCheckoutDeliveryFeePin.unit.test.js`'s new describe block proves the same pinned campaign is
   re-redeemed exactly once, the pinned waiver amount (not a fresh recomputation) is what persists,
   and a competing campaign that would win the selector's own ordering is never touched, plus the D2
   fail-open case specific to this finalize branch. Still not covered here, named rather than
   silently claimed: the full `finalizePaidCommerceSession.js` plumbing layer (module-mocking
   `storeCheckoutUseCase`, this file's own "layer 2") passing a present `autoAppliedVoucherId`
   end-to-end through to `resolveCheckoutContext` — that layer only proves the field is threaded
   through verbatim (already covered, `autoAppliedVoucherId` absent), not this new positive case; the
   `resolveCheckoutContext`-level coverage added here is what actually exercises the redemption
   behavior itself.
