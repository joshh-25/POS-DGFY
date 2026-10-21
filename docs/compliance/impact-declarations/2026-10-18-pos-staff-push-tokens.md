---
status: reference
owner: engineering
last_reviewed: 2026-10-18
declaration_id: 2026-10-18-pos-staff-push-tokens
classification: major
surfaces: payments,privacy,pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.10.18
verification_evidence: changed-file JavaScript syntax checks pass; check:architecture,check:adr,lint:docs,check:compliance,check:compliance:api-contracts, and app-version checks pass; focused Jest tests added but not run
rollback_note: Set PUSH_PROVIDER=unconfigured to disable provider delivery. Reverting the staff routes and post-commit dispatcher does not require order-state repair. The additive migration can be rolled back; staff-only token bindings are dropped because the previous owner schema cannot represent them, while customer token bindings and delivery history remain intact.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-18T11:26:19.301Z
preflight_request_ref: PREFLIGHT-39122891967-2026-10-18-POS-STAFF-PUSH-TOKENS
---

# POS Staff New-Online-Order Push Tokens

## Compliance Impact Classification

Major. Store checkout code is within the `payments` surface. The new registration flow processes
Expo device tokens and binds each token to a tenant staff user; that association is personal data
under the [Data Privacy Act of 2012 (Republic Act No. 10173)](https://officialgazette.gov.ph/2012/08/15/republic-act-no-10173/).

## Affected Surfaces

- `apps/dgfy-api/src/modules/store/`: fresh online-order checkout dispatch (`payments`).
- `apps/dgfy-api/src/modules/pushDelivery/` and `apps/dgfy-api/src/routes/pos.js`: staff token
  registration, deletion, targeting, and delivery history (`privacy`).
- Landlord database: staff tenant/user binding columns and the owner-exclusivity constraint.

## Compliance Preconditions

The provider remains `unconfigured` by default. This change does not add credentials or enable live
push traffic. Production must remain disabled until Expo project configuration, APNs/FCM credentials,
and dedicated `PUSH_TOKEN_HASH_SECRET` values are provisioned through SOPS.

The staff payload contains only a generic new-order title/body, numeric `order_id`, and
`location_id`. It excludes the tracking PIN, customer contact/address, order lines, `company_token`,
and access tokens. Raw Expo tokens are stored only in the active token table and sent to the provider;
delivery history stores the token HMAC, event dedupe key, coarse order identity, provider ticket and
receipt state, timestamps, and safe error codes. Staff tokens are revoked on sign-out, staff
deactivation/removal, device-unregistered receipts, or 90 days without refresh. Permission and
location changes are enforced again at dispatch time.

The checkout call runs after a fresh order transaction commits and does not delay or fail checkout;
idempotent replays do not dispatch. Deactivation, company removal, and inactivity cleanup revoke
staff bindings best-effort. Reverting checkout dispatch needs no order-state repair, while rolling
back the owner migration discards only staff token bindings that the prior schema cannot represent.
The route and payload contract, owner schema, ADR 0097 amendment, and Phase 514 ledger entry document
the integration boundary and its rollout limitations.

No live request-time compliance preflight was executed in this local session. The
`NOT-EXECUTED-2569-2026-10-18` reference is the expected PR-open placeholder; the automatic sweep
will reconcile it after the declaration lands on `develop`.

## Verification Evidence

The declaration records the required repository checks and authored focused tests. Jest Tier 2
tests were not run in this session. No provider credentials or production environment were touched;
real-device validation remains post-merge work.
