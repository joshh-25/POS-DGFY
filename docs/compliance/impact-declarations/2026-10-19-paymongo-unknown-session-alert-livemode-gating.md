---
status: reference
owner: engineering
last_reviewed: 2026-10-19
related_adr: docs/architecture/adr/0052-tenant-revenue-collection-ledger-and-settlement.md
declaration_id: 2026-10-19-paymongo-unknown-session-alert-livemode-gating
classification: regulatory
surfaces: payments,webhooks,commerce
reason_codes_impacted: none
policy_version: 2026.10.19
verification_evidence: node --check apps/dgfy-api/src/modules/commercePayments/usecases/handlePayMongoCommerceWebhookUseCase.js,npm --prefix apps/dgfy-api test -- --runTestsByPath tests/finalizePaidCommerceSession.usecase.test.js tests/commercePaymentRefunds.usecases.test.js tests/commercePaymentReadiness.usecases.test.js tests/tenantRevenue.security.contract.test.js,npm run check:architecture,npm run lint:docs,npm run check:compliance,node scripts/check-app-version-bump.js
rollback_note: Revert this change to restore the unconditional error alert for unknown paid sessions. No payment data, schema, or retry behavior changes; audit rows and webhook responses remain unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-18T17:16:54.280Z
preflight_request_ref: PREFLIGHT-39148362837-2026-10-19-PAYMONGO-UNKNOWN-SESSION-ALERT-LIVEMODE-GATING
---

# PayMongo Unknown-Session Alert Livemode Gating

## Compliance Impact Classification

Regulatory. The changed code is in `apps/dgfy-api/src/modules/commercePayments/`,
which handles signed payment webhooks and live-money finalization. This change
only gates the existing operational alert by PayMongo runtime and event mode; it
does not change payment acceptance or financial posting. The existing error
alert remains active for live-mode unknown-session events and for a test runtime
that receives an event marked live.

## Affected Surfaces

1. `apps/dgfy-api/src/modules/commercePayments/usecases/handlePayMongoCommerceWebhookUseCase.js`
   — expected test-mode, non-live unknown-session paid events no longer create a
   Sentry operational alert. Live runtime events and events marked `livemode: true`
   keep the existing error alert. Test-mode warnings retain runtime/event mode
   context.
2. `apps/dgfy-api/tests/finalizePaidCommerceSession.usecase.test.js` — covers
   live alerting, test-mode suppression, checkout-session event shape, missing
   `livemode`, and the live-event anomaly path.
3. ADR 0052 and Phase 515 of the implementation ledger record the updated
   operational contract and post-merge verification.

## Compliance Preconditions

1. PayMongo signature verification remains the required first step; the alert
   gate runs only after a verified webhook reaches unknown-session handling.
2. Only `payment.paid` and `checkout_session.payment.paid` retain this
   unknown-session operational alert. Other webhook event behavior is unchanged.
3. Suppression applies only to a `PAYMONGO_MODE=test` runtime when normalized
   event `livemode` is not `true`. `PAYMONGO_MODE=live` and event `livemode: true`
   remain fail-loud.
4. The warning log, `ignored/session_not_found` audit row, and
   `200 {handled:false, reason:'session_not_found'}` response remain in place.
   No schema, migration, retry, revenue posting, or settlement behavior changes.
5. `reason_codes_impacted: none` because no HTTP error code or provider reason
   code is added or changed.
6. This declaration covers implementation and repository validation only. The
   `NOT-EXECUTED-*` preflight reference is the expected state for a develop PR
   and will be reconciled by the continuous compliance sweep; it does not claim
   a live tenant preflight was run.

## Verification Evidence

The focused webhook regression tests cover the mode matrix and preserved audit
and response contracts. Backend syntax, the broader payment regression suites,
architecture checks, documentation/ADR lint, compliance validation, and the app
version floor check are recorded in the PR's `## Testing Evidence` section.
