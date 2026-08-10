---
status: reference
owner: engineering
last_reviewed: 2026-08-10
declaration_id: 2026-08-10-pos-delivery-job-status-handler-fix
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.10
verification_evidence: TerminalPageLayout test suite (11 tests, 3 files, including new deliveryJobStatus regression pin proven via stash/restore),POS frontend lint (0 errors, pre-existing warnings only),apps/dgfy-web production build
rollback_note: Revert the two-line prop pass-through in TerminalPageLayout.jsx (destructure + forward of handleDeliveryJobStatusChange) and the new TerminalPageLayout.deliveryJobStatus.test.jsx file together. No backend contract, database schema, receipt output, payment path, or authorization rule is touched -- purely a dropped React prop restored to its existing call site.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-10T00:00:00+08:00
preflight_request_ref: POS-312-DELIVERY-JOB-STATUS-2026-08-10
---

# POS Delivery Job Status Handler Fix (#312)

## Compliance Impact Classification

Major (path-forced floor for `apps/dgfy-web/src/features/pos/**`). The actual change
is narrow: `TerminalPageLayout.jsx` already receives `handleDeliveryJobStatusChange`
as a prop from `TerminalPage.jsx` and already forwards ~12 sibling handlers
(`handleIncomingOrderStatusChange`, `handleOpenIncomingOrderReceipt`, etc.) into
`TerminalOperationsWorkspace`, but silently omitted this one. No new capability,
no new state, no new endpoint -- restoring a single missing prop pass-through so an
already-built, already-tested handler (`TerminalPage.jsx:4223`) actually reaches the
button that is supposed to invoke it.

## Affected Surfaces

1. `apps/dgfy-web/src/features/pos/components/TerminalPageLayout.jsx` --
   `handleDeliveryJobStatusChange` added to the component's destructured props and
   forwarded to `<TerminalOperationsWorkspace>` alongside the existing
   `handleIncomingOrderStatusChange`.
2. No change to `TerminalPage.jsx` (already passed the prop in), `TerminalOperationsWorkspace.jsx`
   (already accepts and consumes the prop, defaulting to a no-op when absent -- that
   default is what made the drop silent), or `TerminalOperationsPanels.jsx` (already
   wires the "Assign Delivery" button to call it).
3. No backend route, use case, or delivery-job state-machine logic is touched --
   the backend's `DELIVERY_JOB_NOT_DELIVERED` guard that surfaced this defect is
   correct and unchanged; the bug was purely that the frontend request that guard is
   waiting for never fired.

## Compliance Preconditions

1. No checkout, payment, receipt, shift, or fiscal logic is touched.
2. No new permission, role, or authorization check is added or removed -- the
   "Assign Delivery" button was already gated identically before and after this fix;
   it simply now actually does something when clicked.
3. No new backend contract or API surface -- this is a pure frontend prop-wiring fix
   restoring an existing, already-contracted call.
4. Behavior change is strictly additive/corrective: before this fix the button was a
   silent no-op (worse for the cashier, no observable side effect); after, it fires
   the same request `TerminalOperationsPanels.jsx` was already coded to send. There
   is no path by which this fix can newly break the delivery-job state machine --
   the backend transition guard it now actually reaches is pre-existing and unchanged.

## Verification Evidence

1. New regression test `TerminalPageLayout.deliveryJobStatus.test.jsx` added and
   proven genuine via the repo's stash/restore technique: with the two-line fix
   stashed, the test fails (`expected undefined to be [Function Mock]`); restored,
   it passes.
2. `npx vitest run src/features/pos/__tests__/TerminalPageLayout*` -- 3 test files,
   11 tests, all green (the two pre-existing `TerminalPageLayout` suites unaffected).
3. `npx eslint` on both touched files -- 0 errors, only 3 pre-existing warnings in
   `TerminalPageLayout.jsx` unrelated to this change (unused `createPortal` import,
   unused `queuedTerminalOperations`/`queueTotalCount` vars, an existing
   `exhaustive-deps` warning).
4. `npx vite build` for `apps/dgfy-web` -- succeeded, no new warnings.
5. `npm run check:compliance -- --staged` passed with this declaration staged
   alongside the `apps/dgfy-web/src/features/pos/**` changes it covers.
