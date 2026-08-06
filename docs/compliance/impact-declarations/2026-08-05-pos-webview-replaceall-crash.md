---
status: reference
owner: engineering
last_reviewed: 2026-08-05
declaration_id: 2026-08-05-pos-webview-replaceall-crash
classification: regulatory
surfaces: pos,terminal,settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.08.05
verification_evidence: npm run check:compliance -- --staged
rollback_note: Revert this commit. Every change is either a `.replace(/x/g, ' ')` swap back to the removed `.replaceAll('_', ' ')` call (byte-identical output for every input, proven by the unchanged existing test suites), a lint rule addition, a `build.target` addition to four Vite configs, a new test file, or the additive `webview_chrome_major` Sentry tag. No data, schema, or persisted state is touched, so reverting has no migration or cleanup step.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-05T13:24:16Z
preflight_request_ref: DGFY-POS-B
---

# POS WebView `String.prototype.replaceAll` Compatibility Fix

## Compliance Impact Classification

Regulatory (floor set by `frontend/Pages/admin/TenantManager.jsx`, which the compliance
guardrail always treats as `regulatory` regardless of diff size). The change to that file is
one line: the compliance audit log entry's `event_type` display string switches from
`.replaceAll('_', ' ')` to `.replace(/_/g, ' ')`. For every input these two calls produce
byte-identical output -- a global regex replace and `replaceAll` are equivalent when the
search value is a string, per the ECMA-262 `replaceAll` spec (it throws for a non-global
regex, but is a documented drop-in for the string-argument case). No audit log data,
compliance record, filing logic, or reason code is read, written, or reclassified.

## Affected Surfaces

1. **Root cause**: `frontend/src/features/pos/components/TerminalOperationsPanels.jsx`'s
   `IncomingQueueWorkspace` crashed (Sentry `DGFY-POS-B`) rendering every incoming order on
   the production POS terminal, because the iMin Android WebView (Chrome 80-84) has no
   `String.prototype.replaceAll` (ES2021 / Chrome 85+).
2. **Fix**: all 17 runtime `.replaceAll('_', ' ')` call sites across POS
   (`TerminalOperationsPanels.jsx`, `TerminalOperationsWorkspace.jsx`,
   `OnlineOrderDetailsModal.jsx`, `OnlineOrderReceiptModal.jsx`, `TerminalPage.jsx`),
   admin/reports (`PaymentOperations.jsx`, `TenantManager.jsx`,
   `TenantRevenueReadOnlyPanel.jsx`, `TenantRevenueSettlementPanel.jsx`,
   `StorefrontCustomDomainsModal.jsx`), and storefront (`FnbQrphPaymentPanel.jsx`) are
   replaced with the equivalent `.replace(/x/g, ...)` form. Every site is pure display-text
   formatting (status labels, a CSV cell escape, an audit log event-type label) -- none reads
   from or writes to a compliance, payment, tax, or fiscal record.
3. **Guardrail**: a `no-restricted-syntax` ESLint rule now bans `.replaceAll(` in frontend
   source, and all four Vite configs pin `build.target` to the iMin hardware's Chrome 80
   floor, so this class of crash cannot silently ship again.
4. **Settings surface**: touched only because `frontend/Pages/admin/TenantManager.jsx` sits
   under `frontend/Pages/admin/`, which the guardrail always classifies `settings,compliance`
   regardless of the nature of the edit; the single line changed there is the audit-log
   `event_type` label formatting described above.

## Compliance Preconditions

1. No checkout, payment, discount, inventory, shift, receipt, tax, or compliance-record logic
   is modified. Every change is either string-formatting-equivalent, a lint/build config
   addition, a new test, or the additive `webview_chrome_major` Sentry diagnostic tag.
2. The compliance audit log entries themselves (`entry.event_type`, `entry.metadata`) are
   read exactly as before in `TenantManager.jsx` -- only the underscore-to-space formatting
   of the displayed label changes implementation, not output.
3. No API contract, request/response shape, or database schema changes.

## Verification Evidence

1. `npm run check:compliance -- --staged` passed with this declaration staged alongside the
   changed files it covers.
2. Frontend test suite (Docker, Linux natives bind-mounted): 293/293 tests pass across
   `src/features/pos/__tests__`, `src/features/reports/__tests__`, and `src/features/admin`
   with the `.replace(/x/g, ...)` swap in place, proving no rendered text changed.
3. New `src/features/pos/__tests__/webViewStringCompat.contract.test.jsx` (3/3 passing) and
   the existing `receiptContractConformance.contract.test.js` WebView-compat case (11/11
   passing) directly exercise the fixed render paths with `String.prototype.replaceAll`
   stubbed to `undefined`, reproducing the exact crash condition from `DGFY-POS-B`.
4. `frontend/src/observability/__tests__/sentryClient.test.js` (55/55 passing, including new
   cases) covers the additive `webview_chrome_major` tag.
5. `npm run lint` (default scope): 0 errors.
6. All four Vite builds (`pos`, `skupervisor`, `store`, root) succeed; shipped bundles grepped
   clean of both `replaceAll` and `??=`/`||=`/`&&=`.
