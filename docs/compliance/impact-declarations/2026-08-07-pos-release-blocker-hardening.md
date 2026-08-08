---
status: reference
owner: engineering
last_reviewed: 2026-08-08
declaration_id: 2026-08-07-pos-release-blocker-hardening
classification: regulatory
surfaces: pos,terminal,settings,compliance,payments
reason_codes_impacted: ALLOWED,VERIFICATION_REQUIRED,IMPACT_DECLARATION_REQUIRED
policy_version: 2026.08.05
verification_evidence: npm run check:architecture,npm run check:compliance,npm run lint:docs,npm --prefix backend test,npm --prefix frontend test,npm run build:pos
rollback_note: Revert the POS, payment-finalization, catalog-realtime, Z-reading, and terminal-device changes together with this declaration; apply migration rollback only under the deployment rollback procedure.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-07T00:00:00+08:00
preflight_request_ref: POS-RELEASE-BLOCKER-HARDENING-20260807
---

# POS Release-Blocker Hardening

## Compliance Impact Classification

Regulatory, because the changed POS, terminal, payment-finalization, settings,
and compliance-sensitive surfaces affect how paid online orders become POS
transactions and how shift/Z-reading controls are attributed. The change
preserves existing payment authorization and fiscal rules while adding
recovery/audit controls around confirmed PayMongo payments.

## Affected Surfaces

1. POS reports now reject a non-object query with the existing validation error
   contract and HTTP status `400` before reading query fields or resolving
   location scope.
2. Secondary terminal modals and checkout-only workflow panels load on demand;
   their existing props, behavior, and render contracts remain unchanged.
3. Browser smoke checks use the terminal email field's stable DOM id and allow
   only the known unauthenticated `401` response from the device-status probe.
   Local API smoke reports an invalid tenant token before attempting login.
4. The compliance impact script no longer derives a clean local worktree's
   changed files from an aggregate merge commit. CI diff evaluation remains
   unchanged.
5. A cashier who has authenticated but has not opened a shift can explicitly
   return to terminal login from the Open Shift modal. The action uses the
   existing governed terminal logout/reset path and does not close, transfer,
   or modify any shift.
6. Active online-order controls now separate customer receipt printing from
   kitchen order-ticket printing. `Print Receipt` uses the existing receipt
   path and receipt status lifecycle; `Print Order` uses the existing kitchen
   ticket hardware contract with the fetched order lines, modifiers, and notes.

## Compliance Preconditions

1. Backend validation remains fail-closed and returns the existing
   `VALIDATION_FAILED` application error contract.
2. Lazy loading does not alter server-owned fiscal, payment, discount,
   inventory, shift, receipt, or offline-replay decisions.
3. Smoke allowlisting is limited to the exact device-status endpoint and
   expected locked-terminal authentication state; unrelated HTTP errors remain
   failures.
4. Compliance-sensitive changes remain declaration-gated; no declaration
   classification or surface check is disabled.
5. The Back to Login action must remain limited to the signed-in cashier,
   pre-shift `shift_start` state, and no active shift; admin re-authentication,
   shift resume, and active-shift flows must not expose this action.
6. Kitchen-ticket printing must not update `receipt_print_status`, alter the
   transaction, or create a second payment/receipt record. Drivers without
   kitchen-ticket support must return the existing unavailable-action outcome.
7. PayMongo webhook finalization must reuse the payment type stored in the
   locked checkout payload so card/GCash/QR Ph replay payloads cannot change
   the tenant idempotency hash. Confirmed payments that cannot create an order
   remain recoverable and emit an append-only webhook audit record plus a
   throttled operational alert.

## Verification Evidence

1. Focused POS backend reports tests pass with `400` for invalid query shapes.
2. POS frontend tests and frontend budget-script tests pass.
3. Architecture, ADR, docs, compliance API-contract, and staged compliance
   checks pass.
4. POS terminal browser smoke is rerun against the repository-managed local
   stack.
5. `npm run test -- --run src/features/pos/__tests__/terminalViewModeContracts.test.js`
   passes with the cashier Back to Login contract covered.
6. `npm run build:pos` passes after the terminal modal update.
7. Focused online-order action tests confirm receipt and kitchen print actions
   remain separate, and the POS production build passes after the queue update.
8. Commerce-payment regression tests cover card/GCash payment-type preservation,
   idempotent finalized-session replay, reconciliation, and webhook failure
   audit/alert behavior.
