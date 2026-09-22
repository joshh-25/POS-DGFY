---
status: reference
owner: engineering
last_reviewed: 2026-09-19
declaration_id: 2026-09-19-dglaundry-partner-access
classification: major
surfaces: payments
reason_codes_impacted: AUTHORIZATION_FAILED,SERVICE_UNAVAILABLE
policy_version: 2026.09.19
verification_evidence: npm run test --prefix apps/dgfy-api -- --runTestsByPath tests/dglaundryPartnerClient.test.js tests/dgfyLaundryOrderUseCases.test.js tests/dglaundryBookingPayment.usecase.test.js tests/productionEnvValidation.test.js,node --test scripts/dglaundry-connection-setup.test.mjs,npm run check:architecture,npm run lint:docs
rollback_note: Revert the DGFY partner-token/mapping PR. No migration or production setting is applied by this source change; keep the connection disabled and payments dark until a separately reviewed staging release is qualified.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-22T17:04:03.704Z
preflight_request_ref: PREFLIGHT-35757505429-2026-09-19-DGLAUNDRY-PARTNER-ACCESS
---

# DGLaundry partner access and mapped booking authorization

## Compliance Impact Classification

**Major.** This PR changes the DGFY commerce-payment booking boundary and
provider authorization. DGFY-origin requests now need a short-lived,
operation-scoped service token and an active company/location mapping before a
quote or booking reservation can be sent to DGLaundry. The booking payment
session remains dark unless its feature controls are enabled; this change does
not enable a payment provider, capture a payment, or change payment amounts.

The required `preflight_result` and timestamp fields are the governed
develop-PR placeholder shape. A live authenticated compliance-preflight API
request was **not executed** for this local implementation PR. Per the
request-time preflight protocol, the placeholder must be reconciled by the
automated sweep after the declaration reaches `develop`; this is not runtime or
production approval.

## Affected Surfaces

- **DGFY storefront booking payment** — the company/location pair is checked
  against an active DGFY mapping before the payment session is replayed or a
  DGLaundry reservation is created.
- **DGFY-to-DGLaundry partner authorization** — static bearer configuration is
  replaced for the hosted profile by a five-minute RS256 token with one exact
  scope and explicit company/location claims, independently protected by the
  P-256 request signature.
- **Operator configuration** — staging setup requires explicit registered
  client/key IDs, checks issuer/origin/audience bindings, preserves existing
  keys, rejects configuration drift, and verifies key-pair correspondence.

## Compliance Preconditions

1. Keep the integration disabled and payment feature controls dark until
   DGFY client registration, key publication, branch mapping, and protected
   hosted staging qualification pass.
2. DGLaundry, not DGFY, remains authoritative for quotes, catalog, inventory,
   service execution, and fulfillment. DGFY remains the payment authority only
   for eligible DGFY-origin fixed-price children; per-kilo children remain
   reservation-only.
3. Never use a company or branch supplied only by a browser as authorization.
   An explicit active mapping is required, and the same IDs are placed into the
   scoped token so DGLaundry can independently enforce them.
4. Keep DGFY OIDC, service-client, DGFY request-signing, and DGFY event keys
   under DGFY custody. The installer report and manifest contain no private
   key or bearer token.
5. Local tests prove source behavior only. They do not prove provider JWKS,
   hosted routing, real payment/refund behavior, production safety, or branch
   readiness.

## Verification Evidence

- Four focused DGFY Jest suites passed: 35 tests covering RS256 token claims,
  exact operation scopes, P-256 signatures, unmapped quote and booking denial,
  payment session regression, and production environment validation.
- The setup utility's Node test suite passed: 6 tests, including blocked
  missing registration inputs, repeatable apply/rollback, verification of
  origins and key pairs, and refusal after concurrent configuration drift.
- `npm run check:architecture` passed for 55 modules and 596 code files; the
  controller/model boundary check passed for 98 controller files.
- `npm run lint:docs` and strict ADR validation passed for 30 governed docs and
  90 ADRs.
- Hosted staging qualification, live compliance preflight, production release,
  and live payment testing were not performed.
