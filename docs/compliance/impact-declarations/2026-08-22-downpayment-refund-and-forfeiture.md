---
status: reference
owner: engineering
last_reviewed: 2026-08-22
related_adr: docs/architecture/adr/0070-downpayment-authorization-across-workflow-modes.md
declaration_id: 2026-08-22-downpayment-refund-and-forfeiture
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.08.22
verification_evidence: apps/dgfy-api/tests/commerceOrderLifecycle.usecase.test.js (11 passed, was 3 -- includes the #815 Definition-of-done pin that a reject refunds the captured downpayment and never the order total),apps/dgfy-api/tests/tenantOrderPaymentLedgerRepository.unit.test.js (16 passed, new -- the capture_kind gate, related_pos_order_payment_id back-link, deterministic idempotency keys, already-recorded short-circuit, centavos-to-peso conversion, and both never-throw failure paths),apps/dgfy-api/tests/storeCancelDownpaymentLifecycle.unit.test.js (6 passed, new -- customer-origin attribution for logged-in and guest cancels, post-commit ordering, and survival of both a returned failure and a thrown error),apps/dgfy-api/tests/commercePaymentRefunds.usecases.test.js (8 passed, was 4 -- pending/failed tenant ledger rows on submission plus webhook promotion to successful),backend regression sweep of tests/store tests/commerce tests/pos tests/downpayment -- 950 passed with 29 pre-existing failures, byte-identical to the 932-passed/29-failed baseline measured on the same command with this PR's diff stashed (no regression; the 29 are DB-backed integration suites with no local database plus the known DIRECT_PAYMENT_NOT_READY drift),apps/dgfy-web/src/features/pos/__tests__/terminalDownpaymentVisibility.behavior.test.jsx (6 passed, new),full apps/dgfy-web POS suite (114 files, 581 tests, all passing -- including terminalViewModeContracts.test.js, which string-matches TerminalOperationsPanels.jsx source text),apps/dgfy-web/apps/store storefrontDownpaymentPresentation.test.js (19 passed; the storefront change in this PR is comment-only, verified by diffing out every comment line),npm run build:pos (real Vite build, succeeded),npx eslint on every new/changed file (0 errors; one pre-existing max-lines warning on TerminalPage.jsx at a line this PR does not touch),npm run check:architecture (OK -- 50 modules/508 files; no allowlist exception added),npm run check:compliance (confirmed to fail first with 9 sensitive files, then pass),npm run lint:docs
rollback_note: Revert this PR's diff. No migration and no schema change -- pos_order_payments.kind has been ENUM('downpayment','balance','refund','forfeiture') with a related_pos_order_payment_id column since Phase 137 (#819), and commerce_payment_sessions.downpayment_refundable/capture_kind since Phase 141 (#822); this PR is the first reader and the first writer of the reversal half. Reverting restores the pre-existing behaviour exactly: every reject/cancel refunds unconditionally, the customer self-service cancel endpoint goes back to never touching payments at all, and no 'refund'/'forfeiture' ledger rows are written. Rows already written by this PR remain valid and readable -- they are additive evidence rows, not state other code branches on. No full_payment tenant is affected in either direction, since every new path is gated on capture_kind === 'downpayment'.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-22T19:00:00+08:00
preflight_request_ref: NOT-EXECUTED-824-DOWNPAYMENT-REFUND-FORFEITURE
---

# Accept/reject, refund, and forfeiture for downpayment orders (#824)

## Compliance Impact Classification

Major. The floor comes from three existing rules in `check-compliance-impact.js`:
`apps/dgfy-api/src/modules/commercePayments/**` and `apps/dgfy-api/src/modules/store/**` (both
`payments`-surfaced, `major`-floor), and `apps/dgfy-web/src/features/pos/**` (`pos, terminal`-
surfaced, `major`-floor). This PR touches all three. The gate was confirmed to **fail** first with
exactly these nine files listed, then pass once this declaration was added.

This is a money-movement change in the strictest sense: it introduces the first code path in this
codebase where a customer's captured funds are **deliberately not returned**. That warrants the
`major` floor on its own merits, independent of which directories happen to match a pattern.

## Affected Surfaces

1. `apps/dgfy-api/src/modules/commercePayments/repositories/tenantOrderPaymentLedgerRepository.js`
   (**new**) -- the single writer for tenant-side `pos_order_payments` reversal rows (`kind`
   `'refund'` / `'forfeiture'`). Reaches the tenant database explicitly via `TenantConnector` +
   `getTenantModels` rather than through `dbStore`, because the PayMongo webhook path is
   landlord-scoped and has no tenant request context. Copies the cross-database pattern already
   proven by `updateTenantPaymentStatus` in the same module rather than inventing a second one.
   Placed in `repositories/`, not `services/`: it is data access, and `check-architecture-guardrails`
   flags any usecase importing a `/services` path -- resolved by correct layering rather than by
   adding a new entry to the `usecaseLegacyServiceImports` allowlist.
2. `apps/dgfy-api/src/modules/commercePayments/usecases/commerceOrderLifecycleUseCase.js` -- new
   `initiatedBy` parameter (`'store'` default | `'customer'`) and the forfeiture branch. Previously
   this file treated `rejected` and `cancelled` identically and refunded unconditionally, with no
   reference to `downpayment_refundable` anywhere in it.
3. `apps/dgfy-api/src/modules/commercePayments/usecases/commercePaymentAdminUseCases.js` -- every
   refund attempt now mirrors into the tenant ledger with a status matching the attempt. Placed
   here rather than in the lifecycle use case so the admin refund endpoint
   (`POST /admin/payment-sessions/:id/refunds`) produces a ledger row too.
4. `apps/dgfy-api/src/modules/commercePayments/usecases/handlePayMongoCommerceWebhookUseCase.js` --
   `handleRefundEvent` promotes the tenant ledger row to its terminal status when the provider
   confirms.
5. `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` and `.../store/index.js` --
   `buildCancelStoreOrderUseCase` gains an optional injected lifecycle use case, invoked
   **post-commit** with `initiatedBy: 'customer'`. Wired through a call-time dynamic import to
   break a real module cycle (`commercePayments/usecases/finalizePaidCommerceSession.js` statically
   imports `store/index.js`).
6. `apps/dgfy-web/src/features/pos/components/TerminalOperationsPanels.jsx` and
   `.../pages/TerminalPage.jsx` -- the incoming-order card shows the downpayment/balance split, the
   reject dialog names the real downpayment amount instead of asserting a "full refund", and the
   new `forfeited` outcome gets its own toast.
7. `apps/dgfy-web/apps/store/src/shared/model/storefrontDownpaymentPresentation.js` -- **comment
   only** (a stale `Phase 143` label corrected to `Phase 144`, and the #280 block restated). Not a
   recognized compliance surface, and verified comment-only by diffing out every comment line.

## Compliance Preconditions

1. **Money is never kept by default, and never kept by accident.** `initiatedBy` defaults to
   `'store'`, whose outcome is always a refund, so any present or future caller that omits the
   parameter fails toward returning the customer's money. Forfeiture requires four independent
   conditions to hold simultaneously: status `cancelled`, origin `customer`, a session whose
   `capture_kind` is `downpayment`, and `downpayment_refundable === false` by strict equality. The
   column is nullable, and the strict comparison is deliberate -- an unknown policy refunds.
2. **A store that declines to fulfil never keeps the deposit.** A store-initiated `rejected` *or*
   `cancelled` refunds even at a tenant configured non-refundable. Pinned by two dedicated tests.
   The known limitation is stated rather than hidden: a customer who phones the store and has staff
   cancel is recorded as store-initiated and is therefore refunded. That is the fail-open direction.
3. **The policy is the one the customer agreed to.** `downpayment_refundable` is read from the
   session snapshot taken at capture time (Phase 141), never from the tenant's live settings row, so
   a merchant flipping the toggle after payment cannot retroactively change the terms.
4. **The refunded amount is unchanged by this PR.** ADR 0069 clause 1b `[binding]` fixes it at the
   captured downpayment, which Phase 141 already achieved by redefining
   `session.total_amount_centavos`. This PR adds the test that was missing -- a session with
   `total_amount_centavos: 20000` against `order_total_centavos: 100000` is asserted to refund
   exactly `20000` and explicitly not `100000`.
5. **No order figures are edited.** Neither outcome mutates `amount_paid` or `balance_due`; ADR 0052
   clause 4 requires corrections to be reversal entries. A refund still moves `payment_status` via
   the pre-existing `updateTenantPaymentStatus`; a forfeiture changes no order column at all, since
   nothing was reversed.
6. **Every reversal is auditable, and a reversal in flight is visible.** Refund rows are written
   `pending` on submission and promoted on webhook confirmation, using the `status` enum
   `pos_order_payments` has carried since Phase 137. Idempotency keys are deterministic (the
   landlord refund's `CRF-` reference; `<session-ref>:forfeiture`) against the table's existing
   `UNIQUE (pos_transaction_id, idempotency_key)`, and an existing row short-circuits rather than
   throwing, so a replayed webhook or a retried cancel cannot duplicate a row.
7. **Ledger writing can never break a money operation.** Both ledger functions catch and report
   instead of throwing. A tenant database that cannot be reached must not fail webhook
   acknowledgement -- a thrown error there would make PayMongo retry a money event -- and must not
   roll back a cancel the customer already completed (ADR 0052's Architecture Boundaries).
8. **Full-payment orders are untouched in every path.** Every new branch is gated on
   `capture_kind === 'downpayment'`, verified by a dedicated regression test asserting a
   full-payment session behaves identically with the new parameter present.
9. **No new legal exposure.** The non-refundable disclosure string is unchanged; #280 (T&C lawyer
   review) remains open with no Storefront ToS and no refund policy in the codebase. This PR ships
   the mechanism only, and preserves the replace-one-string seam for when #280 lands.

## Verification Evidence

See the `verification_evidence` front-matter field for the full itemized list. Summary: 41 tests
across four backend files (two new) and 6 in a new POS behavior file, all passing; the backend
regression sweep matched its stashed baseline exactly (29 pre-existing failures both before and
after, +18 passing); the full 581-test POS suite passes including the source-text contract test
that string-matches the component this PR edits; `npm run build:pos` succeeded.

Outstanding before merge:

- `POST /api/v1/compliance/preflight` has **not** been executed against a live environment -- same
  disclosure shape as every prior declaration in this epic (#822, #848/#859, #865/#866). The
  front-matter `preflight_run_at` records this declaration's own authored/classification time, not
  a live API call; it is a placeholder in the format the guardrail's shape check requires
  (`docs/compliance/request-time-preflight-protocol.md`, "What the guardrail does and does not
  verify" -- the check validates field *shape* only and cannot distinguish a recorded real
  preflight from a typed one). `preflight_request_ref` is deliberately prefixed `NOT-EXECUTED-` so
  nothing reading front matter mechanically can mistake it for a real request reference. A reviewer
  with a live environment should run the endpoint and reconcile both fields before merge.
- **No live end-to-end run against a real PayMongo sandbox refund**, and no live exercise of the
  forfeiture path against a `downpayment_refundable = false` tenant. Coverage is unit/behavioral
  only. This is the most significant gap in this PR specifically, because forfeiture is the one
  path where the failure mode is *keeping a customer's money that should have been returned* --
  a reviewer should treat the live E2E steps in the PR body as required before this reaches
  production, not optional.
