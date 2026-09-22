---
status: reference
owner: engineering
last_reviewed: 2026-09-22
related_adr: 0063-pos-split-tender-and-manual-walk-in-payment-recording.md,0073-pos-cashier-attendance-breaks-register-operator-sessions.md
declaration_id: 2026-09-22-dgfy-2028-empty-split-session-shift-close
classification: major
surfaces: pos,terminal
reason_codes_impacted: PAYMENT_SESSION_EMPTY_CANCELLED
policy_version: 2026.09.22
verification_evidence: focused POS split-payment tests,focused API repository/use-case tests,npm run audit:backend-tests:check,npm run check:architecture,npm run check:compliance
rollback_note: Revert the empty split-session lifecycle correction, its regression tests, the regenerated backend test inventory/audit, and this declaration together. No database migration or payment-ledger schema change is included.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-22T17:04:03.706Z
preflight_request_ref: PREFLIGHT-35757505429-2026-09-22-DGFY-2028-EMPTY-SPLIT-SESSION-SHIFT-CLOSE
---

# Empty Split-Payment Session Shift-Close Correction

## Compliance Impact Classification

Major. The changed API files are under `apps/dgfy-api/src/modules/pos/` and the
changed shared UI file is under `packages/web-core/src/features/pos/`; both
surfaces have a `major` classification floor. This change prevents an empty,
zero-paid, allocation-free split-payment session from being created merely by
opening the dialog and permits only that empty state to be cancelled during
shift-close recovery. Funded or allocated sessions remain protected.

The correction does not change payment methods, payment allocation amounts,
provider verification, authorization scope, completed-sale persistence, fiscal
calculation, or database schema.

## Affected Surfaces

- `pos` — split-payment session creation, empty-session cancellation, and the
  shared POS split-payment dialog.
- `terminal` — shift-close, force-close, and location-switch recovery of
  unresolved payment sessions.

## Compliance Preconditions

1. A split-payment session is created only when the cashier records a payment;
   opening or abandoning the dialog alone must not create a server session.
2. Automatic cancellation is limited to sessions with zero paid amount and no
   payment allocations. Funded or allocated sessions must remain unresolved and
   visible to the existing recovery flow.
3. Existing tenant, location, terminal, cashier, shift, permission,
   idempotency, audit, payment allocation, and completed-sale boundaries remain
   authoritative.
4. No migration, schema change, provider integration, or new compliance
   exception is introduced.

## Verification Evidence

- Focused API repository/use-case regression tests pass.
- Focused shared POS split-payment regression tests pass.
- `npm run audit:backend-tests:check` passes after regenerating the committed
  inventory and value-audit artifacts.
- `npm run check:architecture` and `npm run check:compliance` pass.
- Production builds and the full validation evidence are recorded in the PR.

## Preflight Reconciliation

No live environment preflight was executed for this local, develop-targeted
change. `preflight_request_ref: NOT-EXECUTED-DGFY-2028-01` explicitly records
that production verification has not been claimed. The normal promotion-time
compliance preflight remains required.
