---
status: reference
owner: engineering
last_reviewed: 2026-08-22
related_adr: docs/architecture/adr/0070-downpayment-authorization-across-workflow-modes.md
declaration_id: 2026-08-22-downpayment-choice-and-settings-clarity
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.08.22
verification_evidence: apps/dgfy-api/tests/downpaymentPolicy.unit.test.js (21 passed, including the new customer_choice election matrix),apps/dgfy-api/tests/downpaymentSettingsUseCases.unit.test.js (16 passed, customer_choice now accepted, fixed-mode minimum no longer required),apps/dgfy-api/tests/downpaymentSettingsValidator.unit.test.js (6 passed),apps/dgfy-api/tests/storeCheckoutDownpaymentResolution.unit.test.js (23 passed, election threading through quote/checkout/payment-session, including the DOWNPAYMENT_POLICY_UNRESOLVED guard extension),full regression sweep of every backend test file that imports resolveDownpaymentForTotal/storeQuoteSchema/the touched use cases (downpaymentWebhookFinalization/storeCheckoutAffiliatePricing/storeCartQuotePreviewNoContactRequired/storeCheckoutInventoryReservation/storeCheckoutVoucherPromoStacking/storeCatalogPaymentMode -- all green; two pre-existing unrelated failures in storeDirectGcash.usecase.test.js and storeUsecases.applicationResult.test.js confirmed identical on the unmodified baseline via git stash, not a regression),apps/dgfy-web/src/features/pos/__tests__/downpaymentSettingsForm.test.js (23 passed) and downpaymentSettingsPanel.behavior.test.jsx (11 passed, third radio option + hidden Minimum field in fixed mode),full apps/dgfy-web/apps/store/src/ suite (723 passed across 136 files, including the pre-existing retailCheckoutOnlinePayments/simpleCheckoutOnlinePayments/fnbStorefront contract tests that render the exact containers this PR wires the election control through),full dgfy-web suite (2381 passed across 421 files),npm run build:pos and npm run build:store (real Vite builds, both succeeded),npm run lint on every new/changed file (0 problems),npm run check:architecture (clean)
rollback_note: Revert this PR's diff. No migration, no new database column or table -- customer_choice was already a schema-authorized ENUM value (Phase 138/#820), this PR only lifts the use-case-layer 422 that rejected it and relaxes the min_downpayment_centavos requirement to be type-scoped. Reverting removes the third settings option, the storefront election control, and the payment_election field from the checkout payload; every existing full_payment/downpayment_required tenant is unaffected either way, since resolveDownpaymentForTotal's behavior for those two modes is byte-identical to before this PR (only the new customer_choice branch and the fixed-mode minimum relaxation are new code paths).
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-22T16:00:00+08:00
preflight_request_ref: ISSUE-865-866-DOWNPAYMENT-CHOICE-AND-CLARITY
---

# Downpayment settings clarity (#865) + the `customer_choice` payment mode (#866)

## Compliance Impact Classification

Major. The classification floor comes from two existing rules in `check-compliance-impact.js`:
`apps/dgfy-api/src/modules/downpayment/**` and `apps/dgfy-api/src/modules/store/**` (both
`payments`-surfaced, `major`-floor), and `apps/dgfy-web/src/features/pos/**` (`pos, terminal`-
surfaced, `major`-floor). This PR touches both: the downpayment settings use case and policy module
(backend), and the POS settings panel/form (frontend). It also touches storefront checkout code
under `apps/dgfy-web/apps/store/`, which is **not currently a recognized compliance surface** in
this repo's taxonomy (no `COMPLIANCE_SENSITIVE_RULES` pattern matches that path) -- named here for
visibility rather than silently omitted, not because it trips a rule.

## Affected Surfaces

1. `apps/dgfy-api/src/modules/downpayment/usecases/downpaymentSettingsUseCases.js` -- lifts the
   `customer_choice` 422 (reserved since Phase 138/#820); widens the effective-row validation gate
   to cover `customer_choice` alongside `downpayment_required`; scopes the
   `min_downpayment_centavos > 0` requirement to `downpayment_type === 'percentage'` only (#865).
2. `apps/dgfy-api/src/modules/shared/utils/downpaymentPolicy.js` -- `resolveDownpaymentForTotal`
   gains an optional `paymentElection` parameter, consulted only when `settings.payment_mode ===
   'customer_choice'`. The `full_payment`/`downpayment_required` branches are unchanged byte for
   byte. This function never returns `payment_mode: 'customer_choice'` itself -- only
   `full_payment` or `downpayment_required` describe a resolved order.
3. `apps/dgfy-api/src/validators/storeValidator.js` -- adds `payment_election` (`'full'` |
   `'downpayment'`, default `'full'`) to `storeQuoteSchema`, inherited by `storeCheckoutSchema` and
   the payment-session schema.
4. `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` -- the catalog payment-mode resolver
   now passes `customer_choice` through verbatim (previously flattened to `full_payment`); the
   quote/checkout election threads into `resolveDownpaymentForTotal`; the existing
   `DOWNPAYMENT_POLICY_UNRESOLVED` fail-closed guard is widened to cover a malformed
   `customer_choice` row **only when the customer actually elected a downpayment** -- an election of
   `'full'` at a `customer_choice` store correctly resolves to `full_payment` by design and must
   never trip this guard.
5. `apps/dgfy-web/src/features/pos/components/DownpaymentSettingsPanel.jsx` and
   `apps/dgfy-web/src/features/pos/utils/downpaymentSettingsForm.js` -- third payment-mode option
   ("Let the customer choose"), the Minimum downpayment field is hidden entirely in `fixed` mode
   (mirroring the backend's relaxed rule, #865), and helper text is added to all three amount
   fields. `formToPayload` zeroes `min_downpayment_centavos` for any non-`percentage` type rather
   than resubmitting a stale value.
6. Storefront checkout (`apps/dgfy-web/apps/store/`) -- a new pure module
   (`storefrontPaymentElection.js`), a new presentational control
   (`PaymentElectionSelector.jsx`), and threading of the customer's election through
   `StorefrontApp.jsx`'s state, the three checkout route containers (Retail/F&B/Simple), quote
   invalidation, and the shared checkout-payload builder. Not a recognized compliance surface (see
   above) but functionally load-bearing: an election change must invalidate the quote or the UI
   shows a stale split.

## Compliance Preconditions

1. **Zero regression for existing tenants.** `resolveDownpaymentForTotal`'s `full_payment` and
   `downpayment_required` branches are unchanged -- `customer_choice` is a strictly additive third
   branch gated on an equality check (`settings.payment_mode === 'customer_choice'`) that was
   previously unreachable (the row could never be saved as `customer_choice` in the first place).
   No already-saved tenant configuration can regress.
2. **The election defaults to `'full'` everywhere it's threaded** -- `storeValidator.js`'s Joi
   default, `buildFnbCheckoutPayload.js`'s parameter default, and
   `resolveDownpaymentForTotal`'s own fallback when `paymentElection` is absent or an unrecognized
   value. Under-collecting is the dangerous direction for a merchant expecting a downpayment, so an
   unresolved election fails toward the safer, unambiguous full-total capture rather than guessing
   a split. Unit-tested explicitly (garbage-value and absent-value cases in
   `downpaymentPolicy.unit.test.js`).
3. **The minimum-downpayment relaxation only changes previously-rejected cases.** A `fixed`-type
   row with no minimum used to 422 outright; it now succeeds, since `min_downpayment_centavos` was
   never actually consumed by `downpaymentPolicy.js` for that type (its one real consumer is the
   percentage-derived floor). No row that previously saved successfully changes behavior.
4. **The `DOWNPAYMENT_POLICY_UNRESOLVED` guard extension is election-scoped, not mode-scoped.** A
   `customer_choice` store with a malformed effective row and an election of `'full'` must NOT trip
   the guard (the customer never asked for a split, so there's nothing unresolved to fail on) --
   verified with a dedicated pair of tests asserting both directions
   (`storeCheckoutDownpaymentResolution.unit.test.js`).
5. **No money moves through this surface's new code.** This PR extends policy and configuration
   plumbing only -- no PayMongo call shape changes, no new payment-session field beyond the existing
   `capture_kind`/`total_amount` mechanism `customer_choice` collapses into (a resolved
   `customer_choice` order is captured and serialized identically to a `downpayment_required` order;
   the settings-level literal never reaches the payment session itself).

## Verification Evidence

Backend: 4 test files directly extended (`downpaymentPolicy.unit.test.js`,
`downpaymentSettingsUseCases.unit.test.js`, `downpaymentSettingsValidator.unit.test.js`,
`storeCheckoutDownpaymentResolution.unit.test.js`) plus a targeted regression sweep of every other
test file that exercises the touched functions (`downpaymentWebhookFinalization`,
`storeCheckoutAffiliatePricing`, `storeCartQuotePreviewNoContactRequired`,
`storeCheckoutInventoryReservation`, `storeCheckoutVoucherPromoStacking`,
`storeCatalogPaymentMode`) -- all green. Two pre-existing, unrelated failures
(`storeDirectGcash.usecase.test.js`, `storeUsecases.applicationResult.test.js`, both a
`DIRECT_PAYMENT_NOT_READY`/`DIRECT_PAYMENT_CONFIGURATION_INCOMPLETE` drift) confirmed identical on
the unmodified baseline via `git stash` before/after comparison -- not a regression from this PR.

Frontend (POS): `downpaymentSettingsForm.test.js` (23 passed, was 18 before this PR) and
`downpaymentSettingsPanel.behavior.test.jsx` (11 passed, was 6) -- new coverage for the third radio
option, the hidden Minimum field in fixed mode, and the relaxed fixed-mode save path. Full
`apps/dgfy-web/src/features/pos/__tests__/` suite and `npm run build:pos` (real Vite build) both
succeeded.

Frontend (storefront): full `apps/dgfy-web/apps/store/src/` suite -- 723 tests passed across 136
files, including the pre-existing `retailCheckoutOnlinePayments.contract.test.js`,
`simpleCheckoutOnlinePayments.contract.test.js`, and `fnbStorefront.contract.test.js` suites, which
render the exact three checkout containers this PR threads the election control through end to end.
`npm run build:store` (real Vite build) succeeded.

Full `dgfy-web` workspace: 2381 tests passed across 421 files. `npm run lint` (ESLint) on every
new/changed file: 0 problems, 0 new warnings. `npm run check:architecture`: clean.

Outstanding before merge:

- `POST /api/v1/compliance/preflight` has **not** been executed against a live environment -- same
  disclosure shape as prior downpayment-epic declarations (see #859's own
  `2026-08-22-downpayment-settings-pos-ui.md`). A reviewer with a live environment should run the
  endpoint and reconcile `preflight_run_at`/`preflight_request_ref` before merge.
- Live E2E of the storefront election control itself (picking "pay in full" vs. "pay a
  downpayment" against a real `customer_choice`-configured tenant, confirming the quote refreshes
  and the correct payment method set renders) has not been performed -- unit/contract coverage
  only. This mirrors the same outstanding-before-merge disclosure #859's own declaration made for
  its POS panel.
