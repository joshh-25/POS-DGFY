---
status: reference
owner: engineering
last_reviewed: 2026-10-17
declaration_id: 2026-10-17-order-status-push-notifications
classification: major
surfaces: payments,privacy
reason_codes_impacted: NONE
policy_version: 2026.10.17
verification_evidence: Focused API tests (9 suites, 29 tests), API lint (zero errors), and required local Tier 0 checks passed; live compliance preflight was not executed.
rollback_note: Set PUSH_PROVIDER=unconfigured to disable provider delivery. Reverting the feature removes token routes and best-effort dispatch; no order state repair is required. The additive landlord tables can remain until a separately reviewed data-retention decision.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-18T09:08:43.945Z
preflight_request_ref: PREFLIGHT-39113795566-2026-10-17-ORDER-STATUS-PUSH-NOTIFICATIONS
---

# Customer Order-Status Push Notifications

## Compliance Impact Classification

Major. Storefront checkout and order lifecycle code is classified under the `payments` surface.
This change introduces processing of Expo device tokens and a binding between a token and a
customer account or guest order. Treat device tokens and this association as personal data under
the [Data Privacy Act of 2012 (Republic Act No. 10173)](https://officialgazette.gov.ph/2012/08/15/republic-act-no-10173/).

## Affected Surfaces

- `apps/dgfy-api/src/modules/store/`: guest checkout response and proof issuance (`payments`).
- `apps/dgfy-api/src/modules/dgfy/`: account customer-status dispatcher.
- `apps/dgfy-api/src/modules/pushDelivery/`: device token, provider, and delivery-history lifecycle.
- `apps/dgfy-api/src/modules/store/` and `apps/dgfy-api/src/routes/store.js`: guest token registration and removal.
- Landlord database: additive token and delivery-log tables.

## Compliance Preconditions

The push provider remains `unconfigured` by default. This change does not send live push traffic or
enable a provider credential. Production Expo delivery must remain disabled until the Expo project,
APNs/FCM credentials, `EXPO_ACCESS_TOKEN` when enhanced security is enabled, and dedicated
`PUSH_TOKEN_HASH_SECRET` and `STORE_PUSH_PROOF_SECRET` values are provisioned through SOPS.

The push payload carries a tracking PIN and optional public Storefront slug; it excludes customer
name, phone, email, delivery address, and order lines. Push logs retain a keyed HMAC of the Expo
token, an event dedupe key, provider ticket/receipt data, status, safe error code, and coarse order
identity. Raw Expo tokens are stored only in the active token table and are never written to logs or
delivery history. Guest proof is a separate, expiring bearer token bound to the tenant, order, and
tracking PIN; request logging must not record it.

Retention defaults are seven days for guest token bindings, 90 days without refresh for account
tokens, and 30 days for revoked-token and delivery-log rows. The scheduler enforces these windows;
retention can be disabled only through the explicit configuration flag. Expo and APNs/FCM provider
onboarding, customer-facing privacy-notice updates, and real-device verification remain separate
release work before live delivery is enabled.

The live `POST /api/v1/compliance/preflight` endpoint was not run in this local session. The
front-matter result records the scoped local assessment only; `NOT-EXECUTED-2554-2026-10-17` is an
explicit placeholder for the repository's automatic preflight sweep to reconcile after merge.

## Verification Evidence

The focused API validation passed 9 Jest suites and 29 tests, including guest-proof rejection,
token ownership and caps, dedupe, provider failures, receipt handling, retention scheduling,
guest/account activity gates, and migration shape. API lint passed with zero errors and four
pre-existing warnings. Changed-file syntax and whitespace checks, architecture, ADR, documentation,
compliance, backend test-inventory, and app-version checks passed. No live compliance preflight was
executed; the request reference remains `NOT-EXECUTED-2554-2026-10-17` for automatic reconciliation.
