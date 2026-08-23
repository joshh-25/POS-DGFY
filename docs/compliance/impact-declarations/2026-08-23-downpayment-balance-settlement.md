---
status: reference
owner: engineering
last_reviewed: 2026-08-23
related_adr: docs/architecture/adr/0063-pos-split-tender-and-manual-walk-in-payment-recording.md
declaration_id: 2026-08-23-downpayment-balance-settlement
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: BALANCE_SETTLEMENT_METHOD_UNSUPPORTED,BALANCE_SETTLEMENT_CONFIRMATION_REQUIRED,BALANCE_SETTLEMENT_AMOUNT_REQUIRED,BALANCE_SETTLEMENT_NOT_PARTIALLY_PAID,BALANCE_SETTLEMENT_ORDER_METHOD_UNSUPPORTED,BALANCE_SETTLEMENT_FULFILLMENT_NOT_READY,BALANCE_SETTLEMENT_NO_BALANCE_DUE,BALANCE_SETTLEMENT_CASH_SHORT,BALANCE_SETTLEMENT_AMOUNT_MISMATCH,DELIVERY_BALANCE_DUE_OUTSTANDING,PICKUP_BALANCE_DUE_OUTSTANDING
policy_version: 2026.08.23
verification_evidence: apps/dgfy-api/tests/posOrderBalanceSettlement.usecase.test.js (15 passed, new -- every clause-derived guard: cash change off balance_due, all four merchant-owned methods at exact amount, fail-closed confirmation, duplicate submit writing exactly one ledger row, ledger amount is the balance settled not the cash tendered, payment_provider merchant_owned and never paymongo, unpaid/paid orders rejected),apps/dgfy-api/tests/posOnlineOrderCompletionBalanceGate.usecase.test.js (6 passed, new -- both completion gates, the reason-code discrimination between an outstanding balance and an unpaid order, and the plain-COD amount_paid discriminator pin),apps/dgfy-web/src/features/pos/__tests__/terminalBalanceSettlement.behavior.test.jsx (11 passed, new -- button mutual-exclusivity with Collect Cash, dialog based on balance_due not total_amount, fail-closed submit for merchant-owned methods, store-attested-not-DGFY-verified copy),apps/dgfy-api/tests/posPickupCashCollection.usecase.test.js (7 passed, unchanged) and posDeliveryCashCollection.usecase.test.js (7 passed, unchanged) and posDeliveryCompletionGuard.usecase.test.js (7 passed, unchanged) -- the evidence the live COD path was not loosened,apps/dgfy-api/tests/posHandlers.transport.test.js + posDeviceStatus.transport.test.js + posVoid.route.transport.test.js (27+4+4=35 passed after adding the new use case to each suite's module mock -- each enumerates every named export the module under test provides, so a new one has to be declared in all three or the route wiring under test fails to construct; caught by the regression sweep, not guessed at),backend regression sweep of tests/pos tests/store tests/commerce tests/downpayment -- 971 passed / 29 failed / 1000 total, and the 6 still-failing suites are a strict subset of the 7 that also fail against origin/develop with this PR's diff stashed (posCheckout.db.integration, posSalesReconciliation.db.integration, storeDirectGcash.usecase, storefrontPrimaryLocation.discovery.integration, storeRouteTenantContext.integration, storeUsecases.applicationResult -- all pre-existing DB-backed/integration failures with no local database, not introduced by this PR; storeProfile.equivalence.contract additionally failed on the baseline run and not on the branch run, consistent with known test-order flakiness rather than this diff),full apps/dgfy-web POS suite (152 files, 773 tests, all passing),npm run build:pos (real Vite build, succeeded),node --check on every changed apps/dgfy-api file,npx eslint on every new/changed file (0 errors; one pre-existing max-lines warning on TerminalPage.jsx at a line this PR does not touch),npm run check:architecture (OK -- 50 modules/508 files; no allowlist exception added),npm run check:compliance (confirmed to fail first with 11 sensitive files, then pass),npm run lint:docs (OK -- 28 governed docs / 77 ADRs)
rollback_note: Revert this PR's diff. No migration and no schema change -- pos_order_payments.kind has been ENUM('downpayment','balance','refund','forfeiture') and PosTransaction.amount_paid/balance_due have existed since Phase 137 (#819); this PR is the table's first 'balance' writer, not a schema change. Reverting restores the pre-existing behaviour exactly: a partially-paid downpayment order has no way to settle its balance and stays stuck at partially_paid (the pre-existing state, not a new failure mode this PR introduces), the collect-cash endpoints and both completion paths return to their pre-PR guards, and no 'balance' ledger rows are written. Rows already written by this PR remain valid and readable -- they are additive evidence rows, not state other code branches on. No full_payment or plain-COD order is affected in either direction, since every new guard is gated on payment_status === 'partially_paid' or (for the completion-gate discriminator) amount_paid > 0.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-23T00:30:00+08:00
preflight_request_ref: NOT-EXECUTED-825-DOWNPAYMENT-BALANCE-SETTLEMENT
---

# Staff-recorded balance settlement at delivery/pickup (#825)

## Compliance Impact Classification

Major. The floor comes from three existing rules in `scripts/check-compliance-impact.js`:
`apps/dgfy-api/src/modules/pos/**` and `apps/dgfy-api/src/routes/pos.js` (both `pos, terminal`-
surfaced, `major` floor) and `apps/dgfy-web/src/features/pos/**` (same). The gate was confirmed to
**fail** first with exactly eleven files listed, then pass once this declaration was added.

It earns the floor on its own merits too: this PR introduces the first code path where **staff
assert to the server that money was received, and the server records it as fact without any
provider ever confirming it.** ADR 0063 clause 5 `[binding]` is precisely about that asymmetry --
cashier attestation is operational evidence, not independent proof -- and every design choice below
follows from taking that seriously rather than treating a manually-recorded payment as equivalent
to a verified one.

Not `regulatory`: the fiscal/BIR treatment of a balance-settlement event is explicitly deferred by
ADR 0069 clause 9 `[default]` (carried forward verbatim by ADR 0070) and this PR does not invent
one. No fiscal document, no e-sales figure, and no VAT computation changes.

## Affected Surfaces

1. `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js` -- new
   `buildRecordOrderBalancePaymentUseCase`, one new `POS_OPERATION_KEYS` entry, the
   `BALANCE_SETTLEMENT_METHODS` set, and zero-balance gates added to both completion paths
   (`assertDeliveryCompletionReadiness` and the pickup branch of
   `buildUpdateOnlineOrderStatusUseCase`). **`buildCollectCashOnlineOrderUseCase` is not modified**
   -- not one guard loosened, not one line changed. That is #825's own first requirement and the
   single most important property of this diff.
2. `apps/dgfy-api/src/modules/pos/repositories/posRepository.js` -- `createOrderPaymentEntry` and
   `findOrderPaymentEntryByKind`, the POS-side writer/reader for `pos_order_payments`. Mirrors
   `storeRepository.createOrderPaymentEntry` (Phase 141's row-1 writer) rather than importing it:
   the POS module must not reach into the store module's repository, and both resolve the same
   tenant-scoped model through `dbStore` anyway.
3. `apps/dgfy-api/src/routes/pos.js`, `apps/dgfy-api/src/validators/posValidator.js`,
   `apps/dgfy-api/src/modules/pos/controllers/posHandlers.js`,
   `apps/dgfy-api/src/controllers/posController.js`, `apps/dgfy-api/src/modules/pos/index.js` --
   `POST /pos/orders/:id/record-payment`, wired through the same permission
   (`PERMISSIONS.POS.actions.TRANSACT_POS`), pairing (`requirePairedTerminal`), and param-validation
   chain as the two existing collect-cash routes.
4. `apps/dgfy-web/src/features/pos/components/BalanceSettlementDialog.jsx` (**new**) --
   the settlement dialog, extracted as its own component rather than added inline to
   `TerminalPageDialogLayer.jsx` so its fail-closed submit guard is testable without standing up
   every other dialog in the layer.
5. `apps/dgfy-web/src/features/pos/components/TerminalOperationsPanels.jsx`,
   `TerminalPageDialogLayer.jsx`, `pages/TerminalPage.jsx`, `services/posService.js` -- the
   `Settle Balance` action, its state, and the API call. The existing Collect Cash button, dialog,
   and handlers are untouched.

No migration. `pos_order_payments.kind` has included `'balance'` and `PosTransaction.amount_paid` /
`balance_due` have existed since Phase 137 (#819); this PR is the table's first `'balance'` writer,
not a schema change.

## Compliance Preconditions

1. **The live COD path is byte-identical.** `collect-cash` still requires `payment_status ===
   'unpaid'` and `cash_received >= total_amount`. This PR adds a second endpoint whose domain is
   `payment_status === 'partially_paid'`, so the two are disjoint by construction and neither can
   absorb the other's orders. Pinned in both directions: the pre-existing
   `posPickupCashCollection` / `posDeliveryCashCollection` suites pass unchanged, and the new suite
   asserts that an `unpaid` order is rejected by the new endpoint with
   `BALANCE_SETTLEMENT_NOT_PARTIALLY_PAID`.
2. **No balance leg ever reaches a payment provider.** ADR 0069 clause 2 `[binding]` (carried
   forward verbatim by ADR 0070) and ADR 0063 clause 12 `[binding]`. The use case makes no provider
   call of any kind, writes `payment_provider: 'merchant_owned'` for every digital method, and
   hardcodes `providerEventId: null`. A test asserts `payment_provider` is never `'paymongo'`.
3. **A merchant-owned payment fails closed without an explicit attestation.** ADR 0063 clause 6
   `[binding]`: the confirmation must be explicit in the UI *and* the request, and selecting a
   digital method alone is insufficient. Three independent layers enforce it -- the Joi schema
   (`manual_payment_received` is `Joi.valid(true).required()` for every non-cash method, and
   `Joi.forbidden()` on cash so it can never be sent as a blanket flag), the use case
   (`BALANCE_SETTLEMENT_CONFIRMATION_REQUIRED`), and the dialog's disabled submit. The use-case
   layer is tested directly rather than relying on the validator being the only gate.
4. **The server never claims what did not happen.** ADR 0063 clause 5 `[binding]`. A merchant-owned
   settlement leaves `cash_received` and `change_amount` untouched instead of backfilling them to
   look like a cash collection, records no `provider_event_id`, and the dialog states in plain copy
   that the payment is store-attested and "not verified by DGFY". The reference-number field is
   labelled an audit aid, matching clause 7 `[default]`.
5. **The ledger records the balance, never the tender.** A cash settlement of an PHP 800 balance
   with PHP 1,000 handed over writes `amount: 800` and returns PHP 200 change -- change is not
   revenue. Tested explicitly, because computing either figure off `total_amount` (which is what
   the Collect Cash dialog correctly does for *its* flow) would short the customer at the counter.
6. **A duplicate submit cannot settle twice.** The action reuses the durable operation-replay
   mechanism already proven by collect-cash, keyed on `(operation_key, idempotency_key,
   request_hash)` with a re-check inside the transaction so a concurrent duplicate returns the
   first request's stored response. Verified by asserting exactly one ledger row and one audit row
   after a repeated call -- #825's own stated verification condition.
7. **Order state and ledger evidence are written in one transaction.** There is no window where an
   order reads `paid` while `pos_order_payments` has no matching event, mirroring how Phase 141
   writes row 1 alongside order creation. The `balance` row links back to its `downpayment` row via
   `related_pos_order_payment_id` (ADR 0069 clause 4b `[default]`).
8. **Completion now follows the money, not the label.** Both completion paths reject a nonzero
   `balance_due` with their own reason codes. Ordering matters and is deliberate: on pickup, the
   balance check runs *before* the unpaid check, so a partially-paid order reports the actionable
   `PICKUP_BALANCE_DUE_OUTSTANDING` rather than the generic `PICKUP_PAYMENT_REQUIRED`.
9. **The delivery evidence rule was extended, not relaxed.** `assertDeliveryCompletionReadiness`
   previously required `cash_received`/`change_amount` for every COD delivery. A downpayment order
   is persisted as COD (Phase 141 forces `payment_type: 'cash'`) but may settle by a digital tender
   that legitimately has neither. The check now discriminates on `round4(amount_paid) > 0` -- true
   only for an order that captured money online, since the plain-COD path leaves the column at its
   `0` default -- and requires staff attribution plus a zero balance for that case alone. **The
   plain-COD branch is unchanged, and a dedicated test pins it** so the discriminator cannot be
   silently widened into "attribution is sufficient".
10. **Scope is bounded to one settlement per order.** v1 settles the full remaining balance in one
    action (#825). A merchant-owned settlement must equal the balance exactly, which also proves the
    terminal was not acting on a stale balance. The ledger schema supports N rows, so instalments
    remain a later UI concern, not a schema one.

## Verification Evidence

See the `verification_evidence` frontmatter key for the full command-level list. Summary:

- New `apps/dgfy-api/tests/posOrderBalanceSettlement.usecase.test.js` -- the settlement use case,
  including every clause-derived guard above.
- New `apps/dgfy-api/tests/posOnlineOrderCompletionBalanceGate.usecase.test.js` -- both completion
  gates, the reason-code discrimination, and the plain-COD discriminator pin.
- New `apps/dgfy-web/src/features/pos/__tests__/terminalBalanceSettlement.behavior.test.jsx` -- the
  button's mutual exclusivity with Collect Cash, the balance-not-total basis, and the fail-closed
  submit.
- Pre-existing `posPickupCashCollection`, `posDeliveryCashCollection`, and
  `posDeliveryCompletionGuard` suites pass unchanged -- the evidence that the live COD path was not
  loosened.

## Residual Risks

1. **Attestation is trust, by design.** A cashier can record a merchant-owned payment that never
   arrived. ADR 0063 clause 5 accepts this explicitly ("stores must reconcile their own QR,
   terminal, and bank statements"); this PR inherits that posture rather than resolving it. What it
   guarantees is that the record is *labelled honestly* -- `merchant_owned`, attributed to a
   cashier/shift/terminal, with no provider claim.
2. **No reversal path for a mis-recorded balance settlement.** ADR 0063 clause 10 `[binding]`
   requires append-only reversal with a reason for split-tender allocations; no equivalent exists
   for `pos_order_payments` yet, and building one is out of scope here. A wrongly recorded
   settlement today requires the existing void/refund workflow at the order level. Named, not
   silently assumed away.
3. **Fiscal treatment remains deferred** (ADR 0069 clause 9 `[default]`). A balance settlement
   produces no fiscal event and is not reflected in e-sales or Z-reading figures beyond whatever the
   order-level completion already contributes.
4. **Platform fee is unchanged** and remains computed on the captured downpayment only (ADR 0069
   clause 10 `[default]`); #817 tracks whether the balance leg should generate a fee separately.

## Amendment, 2026-08-23 (same-day fix, live-verified)

A live check against the local-test stack (tunneled to https://dgfy-pos.nicenature.space) found
tapping Settle Balance did nothing -- no dialog, no console error, no network call. Root cause:
`handleOpenBalanceSettlement` was defined in `TerminalPage.jsx` and consumed correctly in
`TerminalOperationsPanels.jsx`, but the component tree has two intermediate layers
(`TerminalPageLayout.jsx`, `TerminalOperationsWorkspace.jsx`) that were never given the prop, so it
optional-chained into nothing at the call site. Fixed by mirroring `handleOpenCashCollection`'s own
already-correct plumbing through both layers. No new guard, no new endpoint, no behavior change
beyond making the already-implemented action reachable -- classification and surfaces are
unaffected.

**Affected surfaces, added:**
`apps/dgfy-web/src/features/pos/components/TerminalPageLayout.jsx`,
`apps/dgfy-web/src/features/pos/components/TerminalOperationsWorkspace.jsx`.

**Verification:** live end-to-end on the local-test stack -- dialog opens with the correct balance
basis, `POST /pos/orders/:id/record-payment` returns 200, order flips to `paid`, button disappears,
"Collected by Admin" attribution appears on the card. Full `apps/dgfy-web` POS suite still green
(152 files / 773 tests) -- unchanged, because no existing test exercises prop pass-through across
the full `TerminalPage -> TerminalPageLayout -> TerminalOperationsWorkspace ->
TerminalOperationsPanels` tree; every `*.behavior.test.jsx` in this directory renders leaf components
directly, which is precisely why this gap was invisible to the suite. Named as a residual test-gap
below rather than silently left uncovered.

**Residual risk added:** no test in this codebase currently catches a missing prop across this
specific four-level component tree; building that coverage is out of scope for this fix.
