---
status: reference
owner: engineering
last_reviewed: 2026-09-02
declaration_id: 2026-09-02-storefront-cancel-voucher-reversal
classification: major
surfaces: payments,pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.02
verification_evidence: apps/dgfy-api/tests/storeCancelVoucherReversal.unit.test.js -- actually executed (Jest), new, 11 passing (item-axis only, delivery-axis only with zero benefit_quantity/no mirrored lines, BOTH axes independently, zero-query no-op with no voucher at all, idempotent replay of an already-reversed redemption, 409 on a re-cancel before any voucher work runs, FAIL-CLOSED rollback of the entire cancellation when the reversal fails, lock-ordering (inventory release before reversal before status update before commit), legacy delivery-axis recovery via the exact-key fallback, the documented item-axis legacy gap with its logger.warn asserted, and a guest cancellation with a valid cancel_proof still reversing),apps/dgfy-api/tests/backfillRedemptionTransactionLink.migration.test.js -- actually executed (Jest), new, 6 passing (one exact-key UPDATE per active tenant DB plus landlord, the exact CONCAT key shapes asserted with no LIKE/prefix scan, a database missing either table is skipped, a no-op when the landlord has no tenants table, down() nulls out exactly the same join's rows, up-then-down idempotence),apps/dgfy-api/tests/storeCheckoutDeliveryWaiverDualAxis.unit.test.js -- actually executed (Jest), extended with attachRedemptionsToTransaction on the existing fake voucher repository, 12/12 passing (regression-clean; the new checkout-side write did not change any existing assertion),apps/dgfy-api/tests/voucherReversalUseCases.usecases.test.js -- actually executed (Jest), unmodified, 100% passing (the reversal primitive itself is untouched by this PR, per the plan's own finding),apps/dgfy-api/tests/voucherRedemptionUseCases.usecases.test.js -- actually executed (Jest), unmodified, 100% passing,apps/dgfy-api/tests/storeCancelDownpaymentLifecycle.unit.test.js -- actually executed (Jest), unmodified, 100% passing (regression-clean; confirms the new voucher dependency defaults to a no-op for every pre-existing caller that omits it, and that the post-commit payment-lifecycle block this suite pins is untouched and unreordered),apps/dgfy-api/tests/storeCheckoutVoucherPromoStacking.unit.test.js -- actually executed (Jest), unmodified, 100% passing,node --check on every changed/new .js and .cjs file (dgfy-api and dgfy-migration-runner have no build step; Tier 0 equivalent per .agents/skills/implement/SKILL.md),npm run lint:docs -- passed,npm run check:compliance -- confirmed to fail first (listing storeUseCases.js/store/index.js/voucherRepository.js/vouchers/index.js/voucherReversalUseCases.js/finalizePaidCommerceSession.js as sensitive with no declaration), then pass once this file was added,npm run check:architecture -- passed
rollback_note: The code change (checkout-side attachRedemptionsToTransaction write, cancel-side reverseOrderVoucherRedemptions call, the two new voucherRepository methods) is revertible with no schema dependency -- it only writes an existing, already-indexed, nullable column (voucher_redemptions.pos_transaction_id, present since #455). Any entry_type: 'reversal' ledger rows already written by a cancellation before a revert are append-only and are NOT un-written by reverting the code -- the voucher counters they decremented stay decremented, which is the correct end state (the campaign budget genuinely was returned; reverting the code does not and should not re-grant it). The optional data-only backfill migration (20260904000002-backfill-voucher-redemption-transaction-link.cjs) is reversible: its down() re-runs the identical exact-key join and sets pos_transaction_id back to NULL for exactly the rows it would have set, never a blanket null-out that would also undo the checkout-side write shipped alongside it. No schema (DDL) changes anywhere in this diff -- sync-tenant-schemas.js needs no change and no tenant-schema-report.yml drift is introduced. There is no rollback mechanism for the container deploy path (#495 open).
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-02T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-1390-STOREFRONT-CANCEL-VOUCHER-REVERSAL
---

# Storefront order cancellation reverses its voucher redemption(s) (Phase 242, #1390)

## Compliance Impact Classification

Major. `check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES[1]`
(`/^apps\/dgfy-api\/src\/modules\/vouchers\//`, `surfaces: ['pos','terminal']`,
`minimumClassification: 'major'`) floors this diff for touching `voucherRepository.js`, `index.js`,
and `voucherReversalUseCases.js` (comment-only) under `modules/vouchers/`.
`COMPLIANCE_SENSITIVE_RULES[2]` (`/^apps\/dgfy-api\/src\/modules\/store\//`, `surfaces: ['payments']`,
`minimumClassification: 'major'`) independently floors it for touching `storeUseCases.js` and
`store/index.js`. `COMPLIANCE_SENSITIVE_RULES[5]` (`modules/commercePayments/`, `surfaces:
['payments']`) also fires for `finalizePaidCommerceSession.js`'s comment-only update, redundant with
the `payments` floor already reached via `modules/store/`. Nothing in this diff touches
`modules/compliance/`, `middleware/compliancePolicy.js`, `routes/compliance.js`,
`validators/complianceValidator.js`, `controllers/complianceController.js`, `routes/adminTenants.js`,
or `controllers/adminTenantController.js` — the `regulatory` tier is not reached.

Independent of the mechanical floor, `major` is substantively correct: this diff changes
**money-adjacent ledger state** (voucher redemption counters and an append-only financial/campaign
ledger) on a customer-triggered path, and adds a real, deliberate write to the checkout transaction
(not just the cancel path).

`reason_codes_impacted: ALLOWED` — this phase introduces no new reason code. It calls an existing,
already-shipped use case (`reverseVoucherRedemptionUseCase`, unmodified) for the first time, and
reuses `VoucherReasonCode.VOUCHER_NOT_FOUND`/`VOUCHER_INVALID_STATUS_TRANSITION` guards that use case
already had.

## What this phase does and does not do

Phase 242 of epic #1321, closing a real correctness bug named by #1390 and a blocking prerequisite
for #1332 (auto-applied free-delivery campaigns): before this change, `buildCancelStoreOrderUseCase`
touched vouchers nowhere, so a cancelled storefront order permanently burned whatever voucher
redemption slot/budget it had claimed at checkout — the primitive to reverse it
(`reverseVoucherRedemptionUseCase`) already existed and was already complete (ADR 0066 Validation
item 3 already required it) but had no live caller anywhere in the codebase.

- **The missing link this phase closes**: `voucher_redemptions.pos_transaction_id` has existed
  (indexed, `idx_voucher_redemptions_transaction`) since #455, but was written by nothing — the
  redemption necessarily happens inside `resolveCheckoutContext`, before the checkout transaction has
  an order id. This phase sets it at checkout time, in the same transaction, immediately after the
  two existing `VOUCHER_REDEMPTION_UNRECORDED` guards — both redemption ids (item and/or delivery
  axis) are already in memory, so this is a single indexed `UPDATE`, no lookup, no key
  reconstruction. **This is a real, deliberate touch to the checkout path, not only the cancel
  path** — named explicitly rather than silently smuggled in, per the plan this phase followed.
- **Cancel-side**: `buildCancelStoreOrderUseCase` reads the redemption(s) back via a new
  `voucherRepository.listRedemptionsByTransactionId` (scoped to `channel: 'storefront'`, ordered
  ascending by id for deterministic lock ordering) and reverses each via the unmodified
  `reverseVoucherRedemptionUseCase`, IN-TRANSACTION, between the inventory release and the
  `fulfillment_status: 'cancelled'` flip, before commit — matching ADR 0066 Validation item 3
  exactly, which already required this to run inside the same transaction as the lifecycle change.
- **Fail-CLOSED, deliberately the opposite of #1331's own fail-open precedent for this same
  function's payment-lifecycle block.** That block (further down in the same function) is
  cross-database/cross-provider (ADR 0052's Architecture Boundaries carve-out: a provider failure
  cannot roll back a tenant order decision already committed). The voucher reversal is
  same-database, same-transaction — a failure is atomically undoable, so it throws and rolls the
  entire cancellation back rather than silently failing to return a campaign budget. The customer
  sees a retryable error; nothing is corrupted, and no money has moved (the payment lifecycle block
  is post-commit and never runs if the cancel itself fails).
- **Legacy orders** (placed before this ships, `pos_transaction_id IS NULL`): the delivery axis is
  exactly reconstructable from the order header's `delivery_fee_waiver_voucher_id` (the ledger
  idempotency key is deterministic from it) via a fallback exact-key lookup. The item axis has **no**
  equivalent reconstruction — its key's voucher-id segment is not stored anywhere on the order, and a
  prefix scan was deliberately rejected as a mechanism (client-supplied idempotency keys create a
  real collision hazard between two orders' keys). This residual gap is logged (`logger.warn`), not
  silently dropped, and is closed for existing rows (not new ones going forward, which the checkout
  write already covers) by an optional, included, DATA-ONLY backfill migration (below).
- **Response is purely additive**: `voucher_reversal: { attempted, reversed, entries }`, always this
  stable shape (never `null`, even for an order with no voucher at all), so no consumer has to
  null-guard it.
- Two use-case-level doc-drift fixes in the same PR, per the plan's own finding: the reversal use
  case's own header comment and `finalizePaidCommerceSession.js`'s comment both previously stated it
  had no live caller; both are updated to name the new caller and the narrower gap that remains
  (an abandoned/expired payment session still has no release path — a distinct trigger from a
  cancelled order).
- **Out of scope, named rather than silently dropped** (matches ADR 0066 Consequences item 3's
  surviving half, and Validation item 3's surviving half): a refunded-but-not-cancelled storefront
  order (there is still no storefront refund flow at all to hook a reversal into); a voided POS
  transaction reversing its own redemption (`posUseCases.js` has no `status: 'voided'` path either);
  an admin/manual reversal HTTP surface (the primitive still has exactly one caller); auto-apply
  campaign budgeting (#1332 itself, this phase is its prerequisite, not part of it).

## Affected Surfaces

- `pos`, `terminal` — `apps/dgfy-api/src/modules/vouchers/repositories/voucherRepository.js` (two new
  methods: `attachRedemptionsToTransaction`, `listRedemptionsByTransactionId`),
  `apps/dgfy-api/src/modules/vouchers/index.js` (re-exports `voucherRepository`),
  `apps/dgfy-api/src/modules/vouchers/usecases/voucherReversalUseCases.js` (comment-only — no
  behavioural change; the use case itself is untouched).
- `payments` — `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` (the checkout-side
  `attachRedemptionsToTransaction` call, the new `reverseOrderVoucherRedemptions` helper, the
  cancel-side call site and its two new optional builder dependencies, the additive
  `voucher_reversal` response field), `apps/dgfy-api/src/modules/store/index.js` (wires the real
  `voucherRepository`/`reverseVoucherRedemptionUseCase` into `cancelStoreOrderUseCase`),
  `apps/dgfy-api/src/modules/commercePayments/usecases/finalizePaidCommerceSession.js`
  (comment-only).
- Not compliance-sensitive by the guardrail's own rule set, named anyway for completeness:
  `apps/dgfy-migration-runner/migrations/20260904000002-backfill-voucher-redemption-transaction-link.cjs`
  (data-only, no DDL); `docs/architecture/adr/0066-voucher-sale-time-price-resolution.md` (dated
  amendment); `apps/dgfy-api/tests/storeCancelVoucherReversal.unit.test.js`,
  `apps/dgfy-api/tests/backfillRedemptionTransactionLink.migration.test.js`,
  `apps/dgfy-api/tests/storeCheckoutDeliveryWaiverDualAxis.unit.test.js` (test-only changes).

## Compliance Preconditions

- No refund, settlement, capture, or fiscal-document code path is touched. VAT bucketing is
  unchanged. The totals formula is not touched by this diff at all — the reversal runs after the
  order's totals have already been persisted and committed once, at checkout.
- Every order with no voucher touched at checkout is byte-identical to pre-242 on both the checkout
  and cancel paths — cited to `storeCancelDownpaymentLifecycle.unit.test.js`'s unmodified 100% pass
  and this PR's own "zero-query no-op" test case, not merely asserted.
- `reverseVoucherRedemptionUseCase` itself is unmodified — every invariant it already enforced
  (idempotency pre-check, row-locking, symmetric decrement floored at zero, a negated ledger row,
  mirrored line allocations) is unchanged; this PR only gives it a live caller.
- **Named limitation, not omitted**: a legacy storefront order's item-axis voucher discount cannot be
  reversed on cancellation if the optional backfill migration is not run (or was already superseded
  by an even older order placed before either shipped) — logged via `logger.warn`, not silently
  dropped, and asserted by a dedicated test.
- **Named limitation, not omitted**: the payment-lifecycle block in the same function (post-commit,
  fail-open per ADR 0052) is unchanged and unreordered by this diff — the voucher reversal runs
  strictly before it, in-transaction, and a voucher reversal failure prevents the payment lifecycle
  from ever running at all (the cancel itself fails first).
- Tenant-schema note: the two repository methods write/read an **existing** column
  (`voucher_redemptions.pos_transaction_id`, present since #455) and the backfill migration is
  data-only — no DDL, so `sync-tenant-schemas.js` needs no change and no `tenant-schema-report.yml`
  drift is introduced.

## Verification Evidence

See `verification_evidence` in this file's front matter for the full, itemized list of suites and
pass counts actually executed.

## Preflight Reconciliation

`NOT-EXECUTED-1390-STOREFRONT-CANCEL-VOUCHER-REVERSAL` is expected on a PR targeting `develop`, not a
finding — per `docs/compliance/request-time-preflight-protocol.md`, "Where live preflight actually
runs," the continuous sweep (`.github/workflows/compliance-preflight-sweep.yml`) triggers
automatically once this declaration lands on `develop` and reconciles this front matter within
minutes, well before any promotion is cut. No live `POST /api/v1/compliance/preflight` call was made
from this session — no authenticated `SYSTEM.EDIT_SETTINGS` session against a running backend was
available, matching every other `develop`-targeting PR under this protocol.

## Residual Risks

1. **Item-axis reversal for legacy orders not covered by the backfill migration** — see "Named
   limitation" above. Logged, not silently dropped.
2. **Refunded-but-not-cancelled storefront orders** — ADR 0066 Consequences item 3's surviving half.
   There is still no storefront refund flow to hook a reversal into. Not built in this phase.
3. **POS void reversal** — ADR 0066 Validation item 3's surviving half. `posUseCases.js` has no
   `status: 'voided'` reversal path either. Not built in this phase; hand to `pm` as a separate
   ticket per the plan.
4. **No admin/manual reversal HTTP surface** — the primitive still has exactly one caller.
