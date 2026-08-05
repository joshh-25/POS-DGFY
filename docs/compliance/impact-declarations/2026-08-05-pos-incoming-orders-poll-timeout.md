---
status: reference
owner: engineering
last_reviewed: 2026-08-05
declaration_id: 2026-08-05-pos-incoming-orders-poll-timeout
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.05
verification_evidence: npm run check:compliance -- --staged
rollback_note: Revert the ONLINE_ORDER_POLL_TIMEOUT_MS constant and its use in TerminalPage.jsx's refreshIncomingOrders call to fetchIncomingOnlineOrders; the request reverts to inheriting api.js's global 60000ms axios timeout with no other behavior change.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-05T00:00:00+08:00
preflight_request_ref: POS-INCOMING-ORDERS-POLL-TIMEOUT-20260805
---

# POS Incoming-Orders Poll Timeout

## Compliance Impact Classification

Major (floor set by `frontend/src/features/pos/**`). The only functional change is a
per-request axios `timeout` (20s) passed to the existing `/pos/incoming-orders` poll in
`TerminalPage.jsx`, which previously inherited `api.js`'s global 60000ms default. No
checkout, payment, discount, inventory, shift, or receipt code path is touched.

## Affected Surfaces

1. `refreshIncomingOrders` in `TerminalPage.jsx` now passes `timeout: ONLINE_ORDER_POLL_TIMEOUT_MS`
   (20000ms) to `fetchIncomingOnlineOrders`, which threads it through to the request's
   axios config via the function's existing `requestConfig` passthrough
   (`frontend/src/features/pos/services/posService.js`). No other call site's timeout
   changes -- the global `api.js` default (60000ms) is untouched.
2. On a slow/unresponsive backend, the 12s-interval incoming-orders poll now fails with a
   deterministic client-side timeout at 20s instead of potentially racing nginx's 60s
   `proxy_read_timeout` and surfacing as one of three different error shapes
   (`AxiosError: Network Error`, `timeout of 60000ms exceeded`, or a 504) for the same
   underlying condition.
3. This is a read-only polling endpoint (incoming online-order queue for display). A
   timeout here produces the same existing error-state UI path
   (`accessState: 'error'`) that already handles any other `fetchIncomingOnlineOrders`
   failure -- no new failure mode, just a faster, more consistent one.

## Compliance Preconditions

1. No checkout, payment, discount, inventory, shift, or receipt logic is modified.
2. The backend remains authoritative for order data; this only changes how long the
   client-side POS terminal waits for a response before giving up and retrying on the
   next poll tick.
3. A cashier's open cart, in-progress payment, or unprinted receipt is unaffected --
   `/pos/incoming-orders` is a display-only polling read, not part of any transaction
   flow.
4. Silent polls (`silent: true`, the interval-driven ticks) already suppress the global
   error toast on failure (`skipGlobalErrorToast`); a timeout under this change surfaces
   identically to any other transient failure of this same call today.

## Verification Evidence

1. `npm run check:compliance -- --staged` passed with this declaration staged alongside
   the `frontend/src/features/pos/pages/TerminalPage.jsx` change it covers.
2. Manual review: `ONLINE_ORDER_POLL_TIMEOUT_MS` only reaches this one call site; no
   other POS request timeout changed.
