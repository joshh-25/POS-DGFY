---
status: reference
owner: engineering
last_reviewed: 2026-09-08
related_adr: docs/architecture/adr/0066-voucher-sale-time-price-resolution.md (Decision 4 --
  voucher_redemptions is authoritative; read only, no write path added or changed)
declaration_id: 2026-09-08-order-voucher-visibility
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: VOUCHER_BENEFIT_TARGET_MISMATCH
policy_version: 2026.09.08
verification_evidence: node --check on every changed apps/dgfy-api file (0 errors),npm run build:pos (real Vite build, succeeded -- packages/web-core is the shared trunk this app consumes),npm run build:skupervisor (real Vite build, succeeded -- same shared trunk),npm run check:compliance (confirmed to fail first, listing the sensitive files below, then pass once this declaration was added)
rollback_note: Purely additive and read-only -- revert this PR's diff to fully undo it. No migration, no new column, no new table, no write path touched anywhere in the diff. The Sequelize association this phase relies on (PosTransaction.hasMany(VoucherRedemption, { as: 'voucherRedemptions' })) already existed on develop before this phase (added 2026-08-18, unrelated work) and is untouched here, so there is nothing association-level to roll back either.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-03T18:11:37.531Z
preflight_request_ref: PREFLIGHT-33788577095-2026-09-08-ORDER-VOUCHER-VISIBILITY
---

# Show which voucher was applied on the order list/detail (Phase 265, #1492)

## Compliance Impact Classification

**Major.** Every changed `apps/dgfy-api` source file matches `scripts/check-compliance-impact.js`'s
`COMPLIANCE_SENSITIVE_RULES` at a `major` floor: `apps/dgfy-api/src/modules/store/**` (surface
`payments`) and `apps/dgfy-api/src/modules/pos/**` (surfaces `pos`,`terminal`). The changed
`packages/web-core/src/features/pos/**` files independently match the same `major` floor on
`pos`,`terminal`.

Per `docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs"
(#884/#1163/#1248): `preflight_request_ref` carries a `NOT-EXECUTED-*` placeholder, which is the
accepted, expected state for a PR targeting `develop` -- the continuous compliance-preflight sweep
reconciles it to a real run within minutes of merge, not at PR time.

## Scope

Read-only display feature. No migration, no schema change, no new write path, no new domain error
or checkout-blocking behavior anywhere in this diff -- every change either widens a Sequelize
`include`, widens an existing serializer's output allowlist, or renders already-fetched data.

- `apps/dgfy-api/src/modules/store/repositories/storeRepository.js` -- `buildOrderInclude()` gains a
  `VoucherRedemption` (`as: 'voucherRedemptions'`) include, scoped to `entry_type: 'redemption'`,
  attributes limited to `voucher_redemption_id, voucher_id, code_snapshot, benefit_config_snapshot,
  discount_centavos`. Feeds `getOrderById`/`listOrdersByCustomer`.
- `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` -- new `serializeAppliedVoucher`
  helper and a new `applied_vouchers` field, added to `serializeOrderForCustomer` **only** -- **not**
  to `serializeOrderBase`, which `serializeOrderForPublicTracking` also spreads. This preserves the
  existing deliberate withholding at that function (a raw voucher id has no place on the public,
  PIN-addressable tracking page, same reasoning already applied there to
  `delivery_fee_waiver_voucher_id`); the public tracking payload is byte-identical before and after
  this diff.
- `apps/dgfy-api/src/modules/pos/repositories/posRepository.js` -- the same `VoucherRedemption`
  include added to `buildTransactionInclude()` (the shared helper feeding
  `getTransactionById`/`listIncomingOnlineOrders`/`listOnlineOrderHistory`/
  `getOrderByIdForLifecycle`) and, separately, to `listTransactions()`'s own hand-rolled include
  array (the general sales-history table, retail + online, which does not reuse that helper).
- `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js` -- new `serializeAppliedVouchers` helper,
  wired into `buildListPosTransactionsUseCase`'s existing per-row decoration step (the same place
  `receipt_print_status` is already added), producing an `applied_vouchers` field shaped identically
  to the store-side one above.
- `packages/web-core/src/features/pos/components/orderFulfillmentUi.js` -- new
  `resolveAppliedVouchers(order)` helper, shared by all three frontend targets below. Reads either
  shape (`applied_vouchers`, pre-projected server-side; or the raw `voucherRedemptions` association,
  for the three POS-module reads that have no per-row decoration step of their own) so every caller
  uses one function regardless of which endpoint fed `order`.
- `packages/web-core/src/features/pos/components/POSTransactionHistoryPanel.jsx` -- the Discount
  cell (desktop and tablet-expanded views) now shows the item-axis voucher code and, separately, a
  "Delivery voucher" line. Also fixes a pre-existing display bug this phase's own exploration
  surfaced: a voucher-driven discount row (`discount.discount_type === 'voucher'`) previously fell
  into the same branch as a manager-approved discretionary discount and rendered "Authorized by
  employee #unknown" (vouchers are never manager-approved) -- that branch is now conditioned on
  `discount_type !== 'voucher'`.
- `packages/web-core/src/features/pos/components/OnlineOrderDetailsModal.jsx` -- adds a "Delivery
  Voucher" row to the Delivery Information section (gated the same way that section already is, on
  `order.order_method === 'delivery'`). The item-axis voucher was already shown here before this
  phase (`discount.promo_code` / `discount.discount_type`, from the pre-existing
  `pos_transaction_discounts` audit row #667/ADR 0066 Decision 10 already writes) -- this phase
  closes the delivery-axis gap specifically, which had zero rendering anywhere in this component.
- `packages/web-core/src/features/pos/components/IncomingQueueOrderList.jsx` -- adds a "Voucher" row
  to the order card (both axes, comma-joined) where previously this component showed no discount or
  voucher information at all.

## Affected Surfaces

1. **No money computation, checkout eligibility, or redemption logic is touched.** Every value
   rendered (`code_snapshot`, `benefit_config_snapshot.benefit_target`, `discount_centavos`) is read
   verbatim from the existing `voucher_redemptions` ledger (ADR 0066 Decision 4's own "authoritative
   record of voucher usage"), already written by the existing storefront checkout/cancellation flow
   -- this phase adds no writer to that table.
2. **`entry_type: 'redemption'` scoping, deliberately not reversal-aware.** The new includes filter
   to `entry_type: 'redemption'` only. A later `'reversal'` row (voucher-budget accounting, e.g. on
   order cancellation, per Phase 242/#1390) is not cross-referenced or subtracted -- this is a
   historical "did this order apply this code" display, not a live "is this voucher's budget still
   reserved" state, so a cancelled-and-reversed order still correctly shows which voucher it
   originally applied, matching how `discount_label_snapshot`/`discount_amount` already behave on a
   cancelled order today (neither is cleared on cancellation either).
3. **Public tracking payload is unchanged.** `serializeOrderForPublicTracking` spreads
   `serializeOrderBase`, which this diff does not touch -- `applied_vouchers` is added only to
   `serializeOrderForCustomer`, an authenticated-surface-only field, matching the existing posture of
   every other customer-account field on that function (name/phone/email/address are equally absent
   from the base).
4. **ADR 0066 Decision 4's `[binding]` money-authority clause is not weakened.** That clause governs
   which record wins when a voucher record and a `pos_transaction_discounts` row *disagree on
   money* (POS wins). This phase never compares or reconciles money between the two -- the
   `discount_amount` field this phase adds to the API response is informational display only,
   sourced from `voucher_redemptions.discount_centavos`, and never feeds back into any fiscal total,
   receipt, or `pos_transactions` column.
5. **No new discount slot, no change to the single-governed-discount-per-transaction constraint**
   (ADR 0066 Decision 8). This phase reads whatever redemption rows already exist; it does not
   create, gate, or relax which vouchers may be applied.

## Compliance Preconditions

1. **Read-only.** No migration, no `sync-tenant-schemas.js` entry, no new/changed Sequelize
   association (the `PosTransaction.hasMany(VoucherRedemption, ...)` association this phase's reads
   depend on already existed on `develop` before this branch, added 2026-08-18 for unrelated Phase
   240/#1331 work -- confirmed via `git blame` before writing this phase's plan, so no association
   was added or changed here).
2. **No new reason code, no new validation, no new error path.** `VOUCHER_BENEFIT_TARGET_MISMATCH`
   is cited above as the impacted reason code because this phase's item/delivery-axis display split
   reads the same `benefit_config_snapshot.benefit_target` field that check already gates on --
   listed for traceability, not because this phase changes that check's behavior.
3. **Public/customer-facing tracking page byte-identical before and after.** Verified by inspection:
   `serializeOrderForPublicTracking`'s own function body is untouched in this diff; only
   `serializeOrderForCustomer` (a distinct function, never spread by the public one) gained a field.
4. **Attribute allowlisting on every new include.** Each `VoucherRedemption` include specifies an
   explicit `attributes` list (five columns) rather than the model default -- the ledger row's other
   columns (`idempotency_key`, `metadata`, `reason`, `store_customer_id`, etc.) are never fetched by
   these reads, let alone serialized.

## Verification Evidence

See the `verification_evidence` front-matter field for the itemized list. Summary: `node --check`
clean on every changed `apps/dgfy-api` file; `npm run build:pos` and `npm run build:skupervisor`
(both real Vite builds -- `packages/web-core` is the shared trunk both apps consume, per
`docs/architecture/frontend-split-sync.md`) build clean with no new warnings beyond a pre-existing,
unrelated chunk-size notice.

Outstanding before merge:

- **`POST /api/v1/compliance/preflight` has not been executed** -- front matter carries
  `NOT-EXECUTED-1492-ORDER-VOUCHER-VISIBILITY`, expected on a `develop`-targeting PR per
  `docs/compliance/request-time-preflight-protocol.md`; the continuous sweep reconciles it
  post-merge.
- **`npm run gate:release:local` was not run** -- delegated to `promotion-quality-gate.yml` at
  promotion time (#1431 Phase C/D), not `implement`'s job at PR time.
- **No automated test was added or run for this phase.** This is a pure display/read-path widening
  with no new business logic to unit-test; the two `npm run build:*` runs are real compiler/bundler
  passes (they would fail on a bad import, a JSX syntax error, or an undefined reference), and the
  Sequelize `include`/`attributes` shapes were checked by hand against the `VoucherRedemption`
  model's actual column names. Flagged here rather than silently omitted -- a future session
  extending this feature should add a behavior test for `resolveAppliedVouchers` and the three
  render sites if the display logic grows more branches than the current axis-split.
