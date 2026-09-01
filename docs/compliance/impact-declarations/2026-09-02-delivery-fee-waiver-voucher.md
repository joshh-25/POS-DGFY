---
status: reference
owner: engineering
last_reviewed: 2026-09-02
declaration_id: 2026-09-02-delivery-fee-waiver-voucher
classification: major
surfaces: payments,pos,terminal
reason_codes_impacted: VOUCHER_BENEFIT_TARGET_MISMATCH
policy_version: 2026.09.02
verification_evidence: apps/dgfy-api/tests/storeCheckoutDeliveryWaiverDualAxis.unit.test.js -- actually executed (Jest), new, 12 passing (the headline dual-axis acceptance case plus 11 supporting cases: delivery-alone, item-alone byte-identity, promo+delivery, promo+item+delivery slot-occupied with no delivery redemption burned, partial waiver, over-waiver clamp, pickup skip, both axis-mismatch directions, idempotent replay, cart-quote feedback),apps/dgfy-api/tests/voucherRedemptionUseCases.usecases.test.js -- actually executed (Jest), 32 passing (extended with 6 free_delivery-translation cases: whole-fee NULL waiver / partial cap / over-waiver clamp / fail-closed with no fee base / ledger snapshot fields / preview parity; one pre-existing empty-code shape assertion updated for the additive benefitTarget field),apps/dgfy-api/tests/voucherValidator.test.js -- actually executed (Jest), unmodified, 100%+ passing (regression-clean against the four widened valid() lists and two new fields),apps/dgfy-api/tests/voucherUseCases.usecases.test.js -- actually executed (Jest), unmodified, 100%+ passing (regression-clean against applyBenefitConfig's new free_delivery branch and the two new guards),apps/dgfy-api/tests/addDeliveryVoucherBenefit.migration.test.js -- actually executed (Jest), new, 13 passing (up/down idempotence, enum-append-last assertion, FK-guarded-by-tableExists, drop-before-narrow ordering, loud rollback-blocked-by-live-row failures for both enums, sync-tenant-schemas.js DDL-drift guard for all four additive columns, and a REQUIRED_TENANT_SCHEMA_TABLES.vouchers CREATE TABLE enum-widening assertion -- the two enum widenings have no column-presence repair path, so this last assertion is the one guard against a freshly-provisioned tenant silently keeping the narrow enums),apps/dgfy-api/tests/storeCheckoutDeliveryFeeThreeEntryPointConsistency.unit.test.js -- actually executed (Jest), unmodified, regression-clean,apps/dgfy-api/tests/storeCheckoutCalculatedDeliveryFee.unit.test.js -- actually executed (Jest), unmodified, regression-clean,apps/dgfy-api/tests/storeCheckoutDeliveryFeePin.unit.test.js -- actually executed (Jest), unmodified, regression-clean,apps/dgfy-api/tests/deliveryFeeModeConfig.checkoutFallback.unit.test.js -- actually executed (Jest), unmodified, regression-clean,apps/dgfy-api/tests/storeCheckoutVoucherPromoStacking.unit.test.js -- actually executed (Jest), unmodified, regression-clean (the item-axis single-slot guard is unwidened),apps/dgfy-api/tests/storeCheckoutAffiliatePricing.unit.test.js -- actually executed (Jest), unmodified, regression-clean,apps/dgfy-api/tests/storeCheckoutDownpaymentResolution.unit.test.js -- actually executed (Jest), unmodified, regression-clean,apps/dgfy-api/tests/posVoucherDiscountCalculator.unit.test.js -- actually executed (Jest), unmodified, regression-clean (POS's own discount-slot math is untouched),node --check on every changed/new .js and .cjs file (this phase has no build step; Tier 0 equivalent per .agents/skills/implement/SKILL.md),npm run lint:docs -- passed (85 ADRs / 29 governed docs validated, including the ADR 0066 2026-09-02 amendment and FUNDING_AND_DISCOUNT_STACKING.md's edits),npm run check:compliance -- confirmed to fail first (listing storeUseCases.js/voucherErrors.js/voucherRedemptionUseCases.js/voucherUseCases.js as sensitive with no declaration), then pass once this file was added
rollback_note: The two new pos_transactions columns (delivery_fee_waiver_voucher_id, delivery_fee_waiver_label_snapshot) and the two new vouchers columns (benefit_target, delivery_amount_off_centavos) are additive, nullable/defaulted, and droppable with no dependent read path outside this diff. The two vouchers ENUM widenings (voucher_kind gains 'delivery_campaign', benefit_class gains 'free_delivery') are NOT cleanly reversible once any delivery voucher is authored -- an ordinal reverse-MODIFY truncates/errors on such a row under strict mode; the migration's own down() checks for such rows first and throws rather than silently truncating campaign/financial configuration data (same posture as 20260830000003-add-cheque-payment-method.cjs's own enum-widening precedent), so a revert is safe only before first authoring. Orders already persisted with a non-zero delivery_fee_waiver are NOT recomputed by a revert -- the fee they carry is correct for the money actually collected; only the two new attribution columns become unreadable. There is no rollback mechanism for the container deploy path (#495 open).
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-02T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-1331-DELIVERY-FEE-WAIVER-VOUCHER
---

# Delivery-fee waiver voucher — `free_delivery` benefit class, code-entered (Phase 240, #1331)

## Compliance Impact Classification

Major. `check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES[1]`
(`/^apps\/dgfy-api\/src\/modules\/vouchers\//`, `surfaces: ['pos','terminal']`,
`minimumClassification: 'major'`) floors this diff for touching `voucherUseCases.js`,
`voucherRedemptionUseCases.js`, and `voucherErrors.js`.
`COMPLIANCE_SENSITIVE_RULES[2]` (`/^apps\/dgfy-api\/src\/modules\/store\//`, `surfaces: ['payments']`,
`minimumClassification: 'major'`) independently floors it for touching `storeUseCases.js`. Nothing
in this diff touches `modules/compliance/`, `middleware/compliancePolicy.js`,
`routes/compliance.js`, `validators/complianceValidator.js`, `controllers/complianceController.js`,
`routes/adminTenants.js`, or `controllers/adminTenantController.js` — the seven patterns that floor
at `regulatory` — so that tier is not reached. `modules/deliveryPricing/` is not in the rule set at
all and adds no floor of its own (only its `README.md` changed, non-code).

Independent of the mechanical floor, `major` is substantively correct: this diff changes **money
persistence** (a `pos_transactions` money column, `delivery_fee_waiver`, becomes non-zero for the
first time, plus two new provenance columns) and the **totals-formula derivation** (ADR 0012's
`delivery_fee` term is now reducible by a voucher, on top of Phase 237's calculated-mode change to
the same term), and it **amends a `[default]`-tier clause of an authoritative ADR** (ADR 0066
Decision 8).

`reason_codes_impacted: VOUCHER_BENEFIT_TARGET_MISMATCH` — this phase introduces a genuinely new
reason code (a code entered in the wrong axis-specific field). Declaring `ALLOWED` alone would be
inaccurate, matching the precedent Phase 237 set for `DELIVERY_DISTANCE_OUT_OF_RANGE`.

## What this phase does and does not do

Phase 240 of epic #1321 (Customer delivery pricing), decision 9 — a delivery-fee waiver is a second,
independent discount axis from the item axis, code-entered only (no auto-apply; that is #1332/
Phase 241).

- `vouchers.benefit_class` gains a fourth value, `free_delivery`; `vouchers.voucher_kind` gains
  `delivery_campaign`. Both ENUM values appended LAST (never mid-list — MySQL ordinal semantics).
  Two new columns: `benefit_target` (`items`|`delivery`, `NOT NULL DEFAULT 'items'` — every existing
  voucher stays byte-identical) and `delivery_amount_off_centavos` (nullable — `NULL` means "waive
  the whole fee", a positive integer caps a partial waiver).
- `applyBenefitConfig` (`voucherUseCases.js`) gains two authoring-time fail-closed guards:
  `benefit_class === 'free_delivery'` forces `benefit_target = 'delivery'`; a `fixed_price` voucher
  explicitly targeting `delivery` is rejected outright (there is no per-unit price to pin against a
  fee), mirroring the runtime guard `voucherBenefitPolicy.js` already has
  (`INVALID_DELIVERY_FEE_CENTAVOS`).
- **`pos_transactions.delivery_fee_waiver` (Phase 237's existing amount column) is reused, not
  duplicated.** Two genuinely new provenance columns added: `delivery_fee_waiver_voucher_id` (FK to
  `vouchers`, `ON DELETE SET NULL`) and `delivery_fee_waiver_label_snapshot`. A second amount column
  would have broken Phase 237's own `delivery_fee_base − delivery_fee_waiver === delivery_fee`
  reconciliation invariant, asserted by an already-shipped test this diff does not touch.
- A SECOND, independent storefront checkout payload field, `delivery_voucher_code`, alongside the
  existing `voucher_code` — the acceptance criterion (an item voucher AND a delivery voucher on the
  same order) is unreachable without it. Never slot-guarded against `voucher_code`; the existing
  `VOUCHER_DISCOUNT_SLOT_OCCUPIED` guard is item-axis-only, unwidened.
- Resolution is a new step in `resolveCheckoutContext`, placed AFTER `delivery` is resolved (its
  benefit base, `delivery.baseFee`, does not exist earlier) and AFTER the ADR 0078 out-of-range hard
  block (an out-of-range order must not burn a redemption on a checkout that was always going to
  422). `free_delivery`'s math is translated to `voucherBenefitPolicy.js`'s existing `amount_off`
  arm at the single call site in `voucherRedemptionUseCases.js` — that module gains no new benefit
  class of its own; its own header documents exactly three classes plus the items/delivery axis,
  unchanged. `NULL` (waive the whole fee) maps to a large sentinel so the module's own
  `Math.min(amount, benefitBaseCentavos)` clamp does the job with no new code path there.
- **Structurally excluded from `pos_transaction_discounts`, by four independent mechanisms, not
  convention** (protects `UNIQUE (transaction_id)` and ADR 0066 Decision 8's original invariant): a
  separate write path (`header` vs. `discount` arguments to `createOnlineTransactionWithLines`); a
  field-disjoint resolved shape (`DEFAULT_DELIVERY_WAIVER_APPLICATION` carries none of
  `buildVoucherDiscountRecord`'s five destructured keys — routing it through that function would
  throw a `TypeError` immediately); Phase 239's own mutual exclusion on `lineAllocations` for a
  `benefitTarget: 'delivery'` resolution; and a `VOUCHER_REDEMPTION_UNRECORDED` defensive guard
  (deliberately without the item guard's line-allocation half — all-zero allocations are correct
  here by construction, not a defect).
- The pinned-breakdown replay path (every QRPh/webhook-finalized order) is handled explicitly: the
  delivery voucher is still redeemed exactly once on that transactional pass, but the PERSISTED
  waiver amount is clamped to the pin captured at payment-session creation, never a fresh
  recomputation — a disagreement is logged at `warn`, never thrown, never re-priced (this repo has
  no rollback, #495 open).
- Idempotency: the delivery voucher's ledger key carries a distinct `:delivery` segment
  (`` `${idempotencyKey}:delivery` ``) from the item voucher's bare key on the same checkout
  idempotency key, and `delivery_voucher_code` was added to `hashPayload`'s hashed field set so two
  carts differing only in their delivery voucher never share a checkout idempotency key.
- ADR 0066 Decision 8 amended (2026-09-02): the single governed-discount slot is scoped to the item
  axis only — a delivery-fee waiver never occupies it and is never blocked by it. No invariant is
  weakened; Decision 8's original protection (one row in `pos_transaction_discounts`) is preserved
  exactly, just correctly scoped to the axis it always actually governed.
- POS is unaffected — no delivery-fee resolution path exists there (epic #1321 Wave 0 decision #6),
  and a delivery-targeted voucher typed at a terminal fails closed in the domain layer.
- Out of scope, handed to `pm` per the plan (not built here): waiver-reversal-on-cancellation (the
  reversal primitive is voucher-kind-agnostic and already has no caller for ANY voucher kind today —
  a pre-existing gap this phase does not worsen or fix); storefront/POS UI surfaces (~15 files across
  3 mode families, plus a second code-entry input box — #240 makes the waiver available on every API
  response a UI would read from, and builds no UI, mirroring #1382's precedent for Phase 237).

## Affected Surfaces

- `pos`, `terminal` — `apps/dgfy-api/src/modules/vouchers/usecases/voucherUseCases.js` (schema/
  authoring), `voucherRedemptionUseCases.js` (resolution/translation/ledger snapshot),
  `voucherErrors.js` (new reason code).
- `payments` — `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` (the core checkout
  wiring: normalizer, resolution step, header persistence, serializer, feedback objects, request
  hash, both axis-mismatch guards, the delivery `VOUCHER_REDEMPTION_UNRECORDED` guard).
- Not compliance-sensitive by the guardrail's own rule set, named anyway for completeness:
  `apps/dgfy-api/src/models/Voucher.js`, `PosTransaction.js` (new attributes matching the new
  columns); `apps/dgfy-api/src/validators/voucherValidator.js`, `storeValidator.js`;
  `apps/dgfy-api/scripts/sync-tenant-schemas.js` (tenant-schema self-repair entries and the
  `vouchers` CREATE TABLE fallback's two enum widenings);
  `apps/dgfy-migration-runner/migrations/20260904000001-add-delivery-voucher-benefit.cjs`;
  `apps/dgfy-api/src/modules/deliveryPricing/README.md` (doc only).

## Compliance Preconditions

- No refund, settlement, capture, or fiscal-document code path is touched. VAT bucketing is
  unchanged.
- The totals formula's *shape* is unchanged:
  `round4(subtotal − promo − voucher + delivery_fee + service_fee)` — the `delivery_fee` term's
  value can now additionally reflect a voucher waiver on top of Phase 237's calculated-mode
  derivation; no term added, removed, or reordered.
- Every voucher without a delivery-axis code entered is byte-identical to pre-240 — cited to
  `storeCheckoutVoucherPromoStacking.unit.test.js` and the other unmodified regression suites listed
  in `verification_evidence`, not merely asserted.
- ADR 0066 Decision 1 `[binding]` (a voucher never mutates a persisted unit price) is preserved by
  construction on the delivery axis — `voucherBenefitPolicy.js`'s own Direction A/B invariants
  (unchanged by this phase) make the delivery-targeted arm structurally unable to write a per-line
  price.
- ADR 0066 Decision 8's single-slot invariant (`UNIQUE (transaction_id)` on
  `pos_transaction_discounts`) is preserved exactly, scoped correctly rather than weakened — see the
  four independent mechanisms named above.
- `benefit_config_snapshot` on a delivery redemption's ledger row now additionally carries
  `benefit_target`/`delivery_amount_off_centavos`, a point-in-time record independent of later
  voucher edits, matching the pattern every other benefit-class amount already had.
- **Named limitation, not omitted**: `voucher_redemptions.discount_centavos` on a delivery
  redemption records the waived FEE, not an item discount — no schema change, but any existing "total
  voucher discount" query summing this column across all kinds now mixes two economically different
  quantities. Segregate by the existing `voucher_redemptions.voucher_id → vouchers.voucher_kind`
  join (indexed via `idx_vouchers_kind`) rather than a raw sum. Flagged for #1334 (IMS reporting).
- **Named limitation, not omitted**: waiver-reversal-on-cancellation does not exist for ANY voucher
  kind today (`buildCancelStoreOrderUseCase` touches vouchers nowhere) — this phase adds no new gap,
  but a code-entered delivery voucher inherits the identical pre-existing exposure a code-entered
  item voucher already has. `delivery_fee_waiver_voucher_id` and the distinct `:delivery` idempotency
  key segment are deliberately already in place so the eventual fix (handed to `pm` as a separate,
  cross-voucher-kind ticket) does not have to rediscover them.
- The two vouchers ENUM widenings have no column-presence repair path via
  `REQUIRED_TENANT_SCHEMA_COLUMNS` (that mechanism is presence-only) — `REQUIRED_TENANT_SCHEMA_TABLES
  .vouchers`'s CREATE TABLE fallback was edited directly to carry both widened enums, so a
  wholly-missing tenant table provisioned fresh does not silently keep the narrow enums forever
  (the #860/#639 crash-loop class, in this instance a silent write failure rather than a boot crash).
  Asserted by a dedicated test, not merely stated.

## Verification Evidence

See `verification_evidence` in this file's front matter for the full, itemized list of suites and
pass counts actually executed.

## Preflight Reconciliation

`NOT-EXECUTED-1331-DELIVERY-FEE-WAIVER-VOUCHER` is expected on a PR targeting `develop`, not a
finding — per `docs/compliance/request-time-preflight-protocol.md`, "Where live preflight actually
runs," the continuous sweep (`.github/workflows/compliance-preflight-sweep.yml`) triggers
automatically once this declaration lands on `develop` and reconciles this front matter within
minutes, well before any promotion is cut. No live `POST /api/v1/compliance/preflight` call was made
from this session — no authenticated `SYSTEM.EDIT_SETTINGS` session against a running backend was
available, matching every other `develop`-targeting PR under this protocol.

## Residual Risks

1. **Waiver-reversal-on-cancellation** — see "Named limitation" above. Handed to `pm` as a separate
   issue (`Refs #1321`), not built in this phase.
2. **Mixed-semantics `voucher_redemptions.discount_centavos`** — see "Named limitation" above. Flag
   for #1334 (IMS reporting ticket), not fixed here.
3. **Storefront/POS UI surfaces** — see "What this phase does and does not do" above. Handed to `pm`
   as a separate issue, not built here.
