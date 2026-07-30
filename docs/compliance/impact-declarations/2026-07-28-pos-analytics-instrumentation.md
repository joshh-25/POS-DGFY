---
status: reference
owner: engineering
last_reviewed: 2026-07-28
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-07-28-pos-analytics-instrumentation
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.28
verification_evidence: npm --prefix frontend run lint,npm --prefix backend test -- tests/sentryConfig.test.js,npx vitest run src/observability/__tests__/analyticsClient.test.js src/observability/__tests__/sentryClient.test.js
rollback_note: Revert the trackFunnelEvent calls added to posService.js and terminalOperationQueueStore.js; no request payloads, response handling, checkout amounts, discount/tax calculation, payment submission, receipt content, shift math, or persisted transaction/queue records are changed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-28T11:30:00+08:00
preflight_request_ref: PR-OBSERVABILITY-INSTRUMENTATION
---

# POS Analytics Instrumentation

## Compliance Impact Classification

Major. Both changed files fall under the `frontend/src/features/pos/**` classification floor (`pos`, `terminal`, `major`) per the compliance classification matrix. The change itself is additive PostHog event tracking only: it adds `trackFunnelEvent(...)` calls that read already-computed values (payment method, order totals from the existing response/payload, shift/void/print outcome) and forward them to the analytics client. No financial calculation, request/response contract, or persistence logic is added, removed, or reordered.

## Affected Surfaces

1. `frontend/src/features/pos/services/posService.js` — `openTerminalShift`, `closeTerminalShift`, `forceCloseStaleTerminalShift`, `createPosCheckout`, `voidPosTransaction`, and the catch block of `printPosReceipt` each gained one `trackFunnelEvent(...)` call reading fields already present on the function's existing request payload or response (`payment_method`, `total_amount`, `item_count`, `terminal_id`-adjacent shift id, void reason, print error message). The underlying `api.get`/`api.post` calls, their URLs, headers, and return values are unchanged.
2. `frontend/src/features/pos/services/terminalOperationQueueStore.js` — `markTerminalOperationReplayed` now also fires `trackFunnelEvent(ANALYTICS_EVENTS.POS_OFFLINE_QUEUE_FLUSHED, { operation_type })` after `updateEntry(...)` resolves, using the already-returned entry. The IndexedDB/localStorage read-modify-write logic in `updateEntry` itself is untouched.

## Compliance Preconditions

1. No POS checkout amount, discount, VAT/tax, payment gateway call, receipt content, or shift cash-drawer math is read, written, or recalculated by this change — the new code path only reads already-resolved values purely to forward them as event properties.
2. No change to the offline operation queue's persistence schema, replay ordering, or conflict-resolution logic in `terminalOperationQueueStore.js`; the tracked-event call is additive and placed after the existing `updateEntry(...)` write completes.
3. Analytics calls are fire-and-forget (`trackFunnelEvent` does not `await`, throw, or block the caller) and PostHog itself is disabled by default (`VITE_POSTHOG_ENABLED=false`), so this cannot alter POS transaction behavior even if the analytics call fails or PostHog is unreachable.
4. No new PII is sent to PostHog from these two files — properties are limited to ids, amounts, item counts, and enum-like strings (payment method, fulfillment type, void reason, operation type) already present on the request/response objects.

## Verification Evidence

1. `npm --prefix frontend run lint` — zero errors introduced in either changed file (verified individually via `npx eslint <file> --no-eslintrc -c .eslintrc.json`).
2. `backend/tests/sentryConfig.test.js` — 7/7 passing (unrelated backend Sentry suite, run as part of the same change's overall verification pass).
3. `frontend/src/observability/__tests__/analyticsClient.test.js` and `sentryClient.test.js` — 20/20 passing, covering the shared analytics client both POS files call into.
4. No POS integration/e2e test files were modified; existing POS test suites were not run as part of this change since no POS business logic changed.
