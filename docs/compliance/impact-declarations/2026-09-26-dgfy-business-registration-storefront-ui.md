---
status: draft_pr
owner: DGFY Storefront
last_reviewed: 2026-09-26
related_adr: docs/architecture/adr/0021-dgfy-global-account-identity.md
declaration_id: 2026-09-26-dgfy-business-registration-storefront-ui
classification: major
surfaces: storefront,onboarding,user_registration,settings,pos,terminal,compliance
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,AUTHENTICATION_FAILED,AUTHORIZATION_FAILED
policy_version: 2026.09.26
verification_evidence: Storefront wizard tests 2/2, registration handoff/status contracts 5/5, shared gallery/delivery behavior tests 11/11, Storefront ESLint, Storefront production build, architecture guardrails, docs/ADR lint, git diff check
rollback_note: Revert the three-step registration wizard, draft API adapter, shared-control compatibility props, Storefront alias, tests, and this declaration together; the existing tenant-backed registration endpoint remains available for its existing consumers.
preflight_result: no_breach
preflight_reason_code: NOT_EXECUTED_LOCAL_ONLY
preflight_run_at: 2026-09-26T00:00:00+08:00
preflight_request_ref: NOT-EXECUTED-DGFY-REGISTRATION-STOREFRONT-UI-LOCAL-ONLY
---

# 2026-09-26 DGFY business registration Storefront UI

## Compliance Impact Classification

Major. This change replaces the Storefront business-registration presentation
with an authenticated three-step draft workflow. It collects business and
Storefront setup data, staged private uploads, and two separately versioned
legal consents, but it does not create a tenant, activate a company, issue a
receipt, calculate tax, authorize a payment, or alter an existing transaction.

## Affected Surfaces

- Storefront `/business/grow` registration UI and its DGFY account session.
- Landlord-side registration draft and private staged-upload API contract.
- Shared Storefront gallery and delivery-partner settings controls used by the
  registration wizard and existing POS settings consumers.
- Registration status routing after final submission.

## Compliance Preconditions

1. The wizard uses the authenticated DGFY bearer token and the backend enforces
   draft ownership on every draft, upload, removal, and submit request.
2. The two required legal consents remain separate and are submitted with the
   current company and marketplace term versions; the backend validates them
   again and stores the immutable legal snapshot.
3. Uploaded files remain in private landlord-side storage and use the backend's
   MIME, signature, size, and count validation. No public upload URL is added.
4. No tenant database, tenant activation, fiscal receipt, tax, payment, or
   historical transaction path is touched by this UI slice.
5. The shared-control changes are backwards-compatible: POS retains its
   existing gallery behavior and four-partner default, while registration
   explicitly uses the three-partner limit.

## Verification Evidence

- Storefront registration wizard tests: 2/2 passed, including draft creation,
  step validation/autosave, separate legal consent submission, disabled final
  action, and in-app status routing.
- Existing registration handoff/status contracts: 5/5 passed.
- Existing shared gallery and delivery-partner behavior tests: 11/11 passed.
- Changed Storefront app ESLint, Storefront production build, architecture
  guardrails, controller-boundary checks, docs/ADR lint, and `git diff --check`
  passed. The build retains the repository's existing large-chunk warning.
- Authenticated browser acceptance, fresh landlord migration rehearsal, admin
  review/download, approval materialization, and deployed preflight remain
  required before release completion.
- The front-matter preflight fields retain the repository's PR-open
  `NOT-EXECUTED-*` handoff convention; the live compliance preflight was not
  executed in this local-only worktree and must be reconciled by the governed
  sweep before release promotion.
