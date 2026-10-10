---
status: reference
owner: engineering
last_reviewed: 2026-10-10
declaration_id: 2026-10-10-transactional-order-sms-alerts
classification: major
surfaces: payments,pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.10.10
verification_evidence: API Jest focused suites (5 suites, 55 tests passed),npm run check:architecture,npm run check:compliance,npm run lint:docs,npm run check:adr,GITHUB_BASE_REF=develop GITHUB_HEAD_REF=feature/2416-order-sms-alerts node scripts/check-app-version-bump.js --staged,node --check on each changed API JavaScript file
rollback_note: Revert this change to remove the two best-effort post-commit SMS dispatch calls and their service. The SMS log schema and order state are unchanged; failures are swallowed after commit, so rollback needs no data repair.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-10T00:00:00+08:00
preflight_request_ref: NOT-EXECUTED-2416-2026-10-10
---

# Transactional Order SMS Alerts

## Compliance Impact Classification

Major. `apps/dgfy-api/src/modules/store/` is classified as `payments` and
`apps/dgfy-api/src/modules/pos/` as `pos,terminal`; each has a `major` floor under
`docs/compliance/compliance-classification-matrix.md`. The remaining new DGFY dispatcher uses the
existing SMS sender and does not change the compliance policy engine, payment capture, permissions,
tax calculation, fiscal documents, or consent policy.

## Affected Surfaces

- `apps/dgfy-api/src/modules/store/`: transactional checkout flow (`payments`, `major` floor).
- `apps/dgfy-api/src/modules/pos/`: delivery-job transition (`pos`, `terminal`, `major` floor).
- `apps/dgfy-api/src/modules/dgfy/`: shared dispatcher; outside the path-based floor.

## Compliance Preconditions

The change sends transactional order-received and delivery-completed alerts through the existing
provider-neutral SMS sender after the relevant order transaction commits. The default provider is
still `unconfigured`; this change does not enable real delivery. No marketing-consent lookup is
added because these are transactional order notices. Alert failures do not fail checkout or the
delivery transition. Message content is not persisted, and order-alert log rows leave the UUID
`order_id` null because the source order identifier is an integer.

The SMS provider request carries a customer's phone number to the configured provider when one is
later selected. Provider onboarding must separately establish the required provider, sender,
credential, rate/cost, consent, and opt-out controls before real traffic is enabled.

## Verification Evidence

The live `POST /api/v1/compliance/preflight` endpoint was not run from this local session. The
front-matter result and reason code record the scoped assessment only; `NOT-EXECUTED-2416-2026-10-10`
is an explicit placeholder for the repository's automatic preflight sweep to reconcile after merge.
