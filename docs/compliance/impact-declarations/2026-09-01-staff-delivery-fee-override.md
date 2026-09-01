---
status: reference
owner: engineering
last_reviewed: 2026-09-01
related_adr: N/A -- no delivery-fee-pricing ADR exists yet; epic #1321 plans one alongside Phase 233 (#1324), which is out of this ticket's scope (this ticket targets today's flat pos_transactions.delivery_fee column directly, not a not-yet-built breakdown object)
declaration_id: 2026-09-01-staff-delivery-fee-override
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,CONFLICT,RESOURCE_NOT_FOUND,AUTHENTICATION_FAILED
policy_version: 2026.09.01
verification_evidence: node --check on every changed apps/dgfy-api file (8 files, 0 errors),npx eslint on every changed apps/dgfy-api src file (0 errors),apps/dgfy-api/tests/posDeliveryFeeOverride.usecase.test.js (12 passed, updated for the PR #1336 review fixes -- override applies while unpaid + leaves balance_due at 0 (RF-1/RF-2 regression, real unpaid-COD-order fixture); fee decrease floors balance_due at zero; same-value resubmit is a no-op with no DB write and no audit row; refused when paid; refused when partially_paid (downpayment already collected); refused on a non-delivery order; refused on a voided transaction; reason <3 chars rejected; missing actor rejected; negative delivery_fee rejected; unknown transaction id returns RESOURCE_NOT_FOUND),apps/dgfy-api/tests/posCashRefund.usecase.test.js + tests/modeRolePresets.test.js + tests/permissionsRoleMatrix.test.js (32 passed -- unchanged existing coverage, confirms the new permission/route additions did not regress role-matrix or cash-refund behavior),packages/web-core/src/config/__tests__/permissionsFrontendParity.test.js via apps/dgfy-ims npx vitest (17 passed -- frontend permission mirror kept in sync with the new POS.actions.OVERRIDE_DELIVERY_FEE entry),npm run build (apps/dgfy-ims, real Vite build, succeeded)
rollback_note: Revert this PR's diff. No migration, no schema change -- the mutation writes only to pre-existing pos_transactions columns (delivery_fee, total_amount, balance_due) and the pre-existing audit_logs table via the pre-existing posRepository.createAuditLog path. Reverting removes the new PATCH /api/v1/pos/transactions/:id/delivery-fee route, the new OVERRIDE_DELIVERY_FEE permission, and its 5 mode-role-preset grants; no persisted row references any new column or table, so no backfill or data migration is needed on rollback.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-01T15:00:53.194Z
preflight_request_ref: PREFLIGHT-33522670635-2026-09-01-STAFF-DELIVERY-FEE-OVERRIDE
---

# Staff delivery-fee override, unsettled payment only (Phase 238, #1330)

## Compliance Impact Classification

**Major.** Changed files live under `apps/dgfy-api/src/modules/pos/`,
`apps/dgfy-api/src/routes/pos.js`, and `apps/dgfy-api/src/controllers/posController.js`, which
`scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES` matches to the `pos`/`terminal`
surfaces at a `major` floor. This is also independently a money mutation on
`pos_transactions.delivery_fee`, `total_amount`, and `balance_due` -- AGENTS.md requires a
declaration for exactly this class of change regardless of the automated floor.

Per `docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs"
(#884/#1163/#1248): `preflight_request_ref` carries a `NOT-EXECUTED-*` placeholder, which is the
accepted, expected state for a PR targeting `develop` -- the continuous compliance-preflight sweep
reconciles it to a real run within minutes of merge, not at PR time.

## Affected Surfaces

1. `apps/dgfy-api/src/config/permissions.js` -- new `PERMISSIONS.POS.actions.OVERRIDE_DELIVERY_FEE`
   (`pos:delivery_fee_override`), same class of guard as
   `PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS` per the issue's own scope, but order-level rather
   than a settings write.
2. `apps/dgfy-api/src/config/modeRolePresets.js` -- grants the new permission to the Manager-tier
   role preset in all 5 mode presets (msme, retail, services, restaurant, general), alongside the
   existing `PRICE_OVERRIDE_POS` grant. `DEFAULT_ROLE_PERMISSIONS.manager`
   (`permissions.js`) needs no edit -- it already spreads every `PERMISSIONS.POS.actions` value.
   `admin` gets it automatically via `getAllPermissions()`.
3. `apps/dgfy-api/src/modules/pos/usecases/deliveryFeeOverrideUseCases.js` (**new**) --
   `buildOverrideDeliveryFeeUseCase`. Validates actor + reason (>=3 chars) + non-negative
   `delivery_fee`, loads the transaction row locked inside a DB transaction, refuses on a
   non-delivery `order_method`, refuses on a voided transaction, refuses unless
   `payment_status === 'unpaid'` (see Precondition 2 below), then updates `delivery_fee`,
   recomputes `total_amount` (delta-adjusted; throws `DELIVERY_FEE_OVERRIDE_NEGATIVE_TOTAL` instead
   of clamping if that would go negative -- corrected 2026-09-01, PR #1336 review RF-5) and
   `balance_due` (left at `previousBalanceDue` -- which is always 0 on the only reachable `unpaid`
   state -- unless a balance was already outstanding, in which case it's re-derived from
   `previousAmountPaid`; corrected 2026-09-01, PR #1336 review RF-1, see Precondition 3 below), and
   writes one `audit_logs` row, now including `location_id` (RF-3), in the same DB transaction. A
   same-value resubmit is a no-op: no write, no audit row, still a success response (the client
   always sends the absolute target fee, never a delta, so a retried request cannot double-apply).
   The mutating-branch response re-reads the transaction with its full include
   (`posRepository.getTransactionById`) so its shape matches the no-op branch's (RF-4).
4. `apps/dgfy-api/src/modules/pos/controllers/posHandlers.js` -- new `overrideDeliveryFee` handler.
   Deliberately not routed through `requirePairedTerminal` (unlike void/refund), but resolves the
   acting user via `posMutationUser(req)` (corrected 2026-09-01, PR #1336 review RF-6) rather than
   `req.user` directly, so an operator takeover on a POS terminal still attributes the audit row to
   the actual operator; this still works identically on a back-office call, where it degrades to
   `req.user`.
5. `apps/dgfy-api/src/controllers/posController.js` -- re-exports `overrideDeliveryFee` (all three
   existing export surfaces in this compatibility facade).
6. `apps/dgfy-api/src/routes/pos.js` -- `PATCH /transactions/:id/delivery-fee`, gated on
   `checkPermission(PERMISSIONS.POS.actions.OVERRIDE_DELIVERY_FEE)`.
7. `apps/dgfy-api/src/validators/posValidator.js` -- `overrideDeliveryFeeSchema`
   (`delivery_fee: Joi.number().min(0).precision(4).required()`,
   `reason: Joi.string().trim().min(3).max(255).required()`).
8. `packages/web-core/src/config/permissions_frontend.js` -- mirrors the new permission key/value,
   keeping the `#673` parity test (`permissionsFrontendParity.test.js`) green.

## Compliance Preconditions

1. **Permission-gated.** `checkPermission(PERMISSIONS.POS.actions.OVERRIDE_DELIVERY_FEE)` on the
   route; a caller without the permission never reaches the use case. Granted by default only to
   Manager-tier and Admin role presets, not Cashier -- matching the issue's own framing ("same class
   of guard as `PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS`").
2. **Refused once payment is settled.** The use case checks `payment_status === 'unpaid'`
   specifically -- not merely "not yet paid in full". `unpaid` covers both a plain not-yet-paid
   order and a COD order before staff collects cash (confirmed against
   `posUseCases.js`'s own COD-collection code path: a COD order stays `payment_status: 'unpaid'`
   until the cash-collection flow flips it to `paid`). Every other status --
   `partially_paid`/`paid`/`payment_pending`/`refund_pending`/`partial_refunded`/`refunded`/`failed`
   -- means money has already moved (even partially, e.g. a downpayment) or a payment attempt is
   in flight, and is refused with `reason_code: DELIVERY_FEE_OVERRIDE_PAYMENT_SETTLED`. No
   refund/top-up flow exists in this codebase, which is exactly why the gate is drawn at "any money
   moved" rather than "not yet fully paid" -- pinned by a dedicated `partially_paid` test case, not
   just a `paid` one.
3. **Recomputes balance due correctly.** `total_amount` is delta-adjusted from the existing value
   (`existing.total_amount + (new_fee - previous_fee)`) rather than re-derived from the full totals
   formula, so every other component (subtotal, discount, service fee) is left exactly as checkout
   computed it; it throws `DELIVERY_FEE_OVERRIDE_NEGATIVE_TOTAL` rather than clamping if that delta
   would ever go negative (only reachable on already-corrupt data).
   **Corrected 2026-09-01 (PR #1336 review, RF-1 blocker):** `balance_due` is *not*
   unconditionally re-derived from `amount_paid`. Every writer of `balance_due` in this codebase
   (`storeUseCases.js`'s `resolveStorefrontPaymentSnapshot`, `posUseCases.js:9151`) leaves an
   `unpaid` order at `balance_due: 0` -- the only `payment_status` this use case ever reaches (see
   Precondition 2) -- and the COD cash-collection path
   (`posUseCases.js`'s `buildCollectCashOnlineOrderUseCase`) never clears `balance_due` when it
   flips `payment_status` to `paid`. The original formula (`max(0, total_amount - amount_paid)`)
   therefore unconditionally flipped `balance_due` from `0` to the full new total on every override,
   which then permanently failed `assertDeliveryCompletionReadiness`'s zero-balance gate
   (`posUseCases.js:1511`, `DELIVERY_BALANCE_DUE_OUTSTANDING`) and risked collecting the same amount
   a second time from a customer who had already paid COD in cash. The use case now only recomputes
   `balance_due` from `previousAmountPaid` when `previousBalanceDue > 0`; otherwise it is left at
   `previousBalanceDue` (i.e. `0`, on every currently reachable case). Pinned by a new regression
   test asserting `balance_due` stays `0` after a real unpaid-COD-order override
   (`apps/dgfy-api/tests/posDeliveryFeeOverride.usecase.test.js`) -- the prior fixture used an
   impossible `balance_due: 580` on an `unpaid` order, which is why the original 11 tests passed
   despite the bug.
4. **Audited with before/after + actor.** Confirmed against the codebase before implementing,
   per the issue's own instruction not to assume: Phase 234/#1327's mechanism
   (`workflow_mode_change_log`, via `applyWorkflowModeAuditLog`) is settings-only -- no
   `pos_transaction_id` column, built to log `ops_workflow_mode`/`ops_enabled_capabilities`/
   `ops_disabled_capabilities` settings writes, not applicable to a per-order mutation. Not reused.
   `pos_transaction_adjustments` (the void/refund evidence table) was also considered and rejected
   -- its `adjustment_type` enum is closed to
   `void|cash_refund|external_refund|provider_refund|employee_credit_reversal`, and required
   columns (`tender_type`, `status` lifecycle, `cash_drawer_event_id`) model a financial
   settlement/refund, not a pre-settlement fee correction. The actual sibling reused is the
   generic, already-established per-order path: `posRepository.createAuditLog` ->
   `audit_logs` (`entity_type: 'pos_transaction'`, `entity_id`, `action: 'UPDATE'`, `reason`,
   `changes` JSON with before/after `delivery_fee`/`total_amount`/`balance_due` and the actor's
   `user_id`), written inside the same DB transaction as the mutation -- the identical path
   `posUseCases.js` already uses elsewhere in this module for other order-level events (e.g. COD
   cash-collection). **Corrected 2026-09-01 (PR #1336 review, RF-3 should-fix):** the row now also
   carries `location_id` (`existing.location_id`), matching `cashRefundUseCases.js`'s sibling money
   mutation. `terminal_id`/`shift_id` are written explicitly as `null` rather than omitted -- this
   route is a permissioned back-office edit, not routed through `requirePairedTerminal`, so a real
   terminal/shift context genuinely isn't available here (see Affected Surface 4). Pinned by test:
   the audit row's `changes` payload is asserted to carry both before and after values plus
   `payment_status_at_override`, and the row itself is asserted to carry `location_id`.
5. **No refund/top-up machinery introduced**, matching the issue's explicit scope boundary --
   confirmed by Precondition 2's gate (nothing reachable once any money has moved) and by the
   absence of any new payment-provider or cash-drawer interaction in the diff.
6. **Scoped to delivery orders.** The use case additionally refuses a non-`delivery` `order_method`
   (`reason_code: DELIVERY_FEE_OVERRIDE_NOT_A_DELIVERY_ORDER`) -- not explicitly required by the
   issue text, but a defensive guard against misuse of a delivery-specific lever on an unrelated
   order type. Also refuses a voided transaction
   (`reason_code: POS_TRANSACTION_VOIDED`), matching the existing guard shape
   `posUseCases.js`'s void use case already uses for the same class of check.
7. **No frontend entry point in this PR.** The issue's acceptance evidence is API-level only
   (permission + reason gate, audit, settlement refusal, balance recompute); an IMS/POS UI lever is
   not built here and is left as a stated follow-up rather than silently out of scope.

## Verification Evidence

See the `verification_evidence` front-matter field for the itemized list. Summary: 12 unit tests
for the use case (all payment-status/order-method/reason/actor/negative-fee/no-op/not-found
branches, plus the RF-1/RF-2 regression pinning `balance_due` at 0 on a real unpaid COD order),
all passing; 32 existing tests across cash-refund, mode-role-preset, and
permission-role-matrix suites unchanged and passing (confirms no regression from the new
permission/route); the frontend permission-mirror parity test (17 assertions) passing; a real
`apps/dgfy-ims` Vite build succeeding; `node --check` and `eslint` clean on every changed backend
file.

Outstanding before merge:

- **`POST /api/v1/compliance/preflight` has not been executed** -- front matter carries
  `NOT-EXECUTED-1330-2026-09-01-STAFF-DELIVERY-FEE-OVERRIDE`, which is expected on a
  `develop`-targeting PR per `docs/compliance/request-time-preflight-protocol.md`; the continuous
  sweep reconciles it post-merge.
- **`npm run gate:release:local` has not been run** -- this PR's Tier 0/1/2 self-verification
  (build/syntax, lint, and a targeted test subset) is scoped evidence, not the full local gate;
  that gate is `promoter`'s job at promotion time, not `implement`'s at PR time, per
  `.agents/skills/implement/SKILL.md`.
- **No IMS/POS UI lever exists yet** for staff to trigger this endpoint -- API-only in this PR, per
  Precondition 7 above.
