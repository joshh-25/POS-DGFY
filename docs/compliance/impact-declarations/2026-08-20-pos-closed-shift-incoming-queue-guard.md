---
status: reference
owner: engineering
last_reviewed: 2026-08-20
related_adr: docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md
declaration_id: 2026-08-20-pos-closed-shift-incoming-queue-guard
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.20
verification_evidence: npm --prefix apps/dgfy-web exec vitest run src/features/pos/utils/__tests__/posOperationalVisibility.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js,npm --prefix apps/dgfy-web exec eslint src/features/pos/pages/TerminalPage.jsx src/features/pos/utils/posOperationalVisibility.js src/features/pos/utils/__tests__/posOperationalVisibility.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js,npm --prefix apps/dgfy-web run build:pos,npm run check:architecture,npm run check:compliance,npm run lint:docs,git diff --check
rollback_note: Revert the incoming-order shift predicate, closed-shift error mapping, polling block, focused tests, and this declaration together; the backend POS_SHIFT_CLOSED validation remains unchanged.
preflight_result: no_breach
preflight_reason_code: POS_CLOSED_SHIFT_QUEUE_GUARD
preflight_run_at: 2026-08-20T16:00:00+08:00
preflight_request_ref: POS-CLOSED-SHIFT-INCOMING-QUEUE-GUARD-20260820
---

# POS Closed-Shift Incoming-Queue Guard

## Compliance Impact Classification

Major because the changed files are under the POS terminal surface. The change
is limited to preventing a stale POS terminal from polling the read-only
incoming online-order queue after the server has closed the referenced shift.

## Affected Surfaces

- POS maps the existing backend `POS_SHIFT_CLOSED` and
  `POS_SHIFT_REQUIRED_FOR_INCOMING_QUEUE` reason codes to the existing
  `shift_required` state.
- The stale shift is cleared from the frontend operational context, so the
  terminal returns to the existing “Open a shift” state.
- The polling interval remains inactive until a new open shift is available.
- The backend closed-shift validation, order data, payment handling,
  inventory movement, receipt behavior, and shift accounting are unchanged.

## Compliance Preconditions

1. The frontend must not bypass or reinterpret the backend open-shift guard.
2. A closed or missing shift must not trigger repeated incoming-order requests
   or error toasts.
3. A newly opened shift must restore normal incoming-order polling.
4. The change must not mutate transactions, payments, inventory, receipts, or
   cash-drawer records.

## Verification Evidence

The focused unit and contract tests prove valid, missing, closed, and completed
shift contexts plus the backend reason-code mapping. The POS production build
and changed-file lint must pass before this phase is marked complete.
