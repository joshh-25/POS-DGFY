---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-09-26
related_adr: docs/architecture/adr/0021-dgfy-global-account-identity.md
declaration_id: 2026-09-26-dgfy-business-registration-release-hardening
classification: regulatory
surfaces: api,storefront,admin,database,onboarding,user_registration,settings,pos,compliance
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,AUTHENTICATION_FAILED,AUTHORIZATION_FAILED,SERVICE_UNAVAILABLE
policy_version: 2026.09.26
verification_evidence: Storefront Playwright release gate 3/3, IMS accessibility test 1/1, Storefront focused Vitest 2/2, Storefront and IMS production builds, IMS lint, architecture/docs/compliance checks
rollback_note: Revert the public registration-industry request policy, admin review accessibility behavior, upload progress semantics, runtime diagnostics helpers, release-gate test, focused tests, documentation, and this declaration together; the underlying registration and admin review contracts remain available.
preflight_result: no_breach
preflight_reason_code: NOT_EXECUTED_LOCAL_ONLY
preflight_run_at: 2026-09-26T00:00:00+08:00
preflight_request_ref: NOT-EXECUTED-DGFY-REGISTRATION-RELEASE-HARDENING-LOCAL-ONLY
---

# 2026-09-26 DGFY business registration release hardening

## Compliance Impact Classification

Regulatory. This change hardens the authenticated registration and admin review
surfaces without changing tenant provisioning, payment, tax, receipt, or
historical transaction behavior. It prevents a public catalog request from
triggering an unauthenticated session refresh, improves keyboard and assistive
technology behavior in the review dialog, and adds deterministic release checks
for runtime failures, failed requests, HTTP errors, and responsive overflow.

## Affected Surfaces

- Public and authenticated Storefront registration route and industry catalog
  request.
- Platform-admin registration review dialog and private upload metadata view.
- Storefront and IMS browser-test diagnostics and release-gate coverage.
- Registration upload progress status presented to assistive technology.

## Compliance Preconditions

1. The public industry catalog remains read-only and does not grant access to
   registration drafts, uploads, tenant data, or admin review records.
2. Disabling session refresh and global error toasts applies only to the public
   industry-catalog request; authenticated draft, upload, submit, approval, and
   download requests retain their existing authentication and error handling.
3. Review-dialog focus management does not change server authorization. Existing
   admin authentication, permission checks, draft ownership, and private file
   download controls remain authoritative.
4. The release-gate tests use deterministic intercepted responses for local
   validation and do not represent a live migration rehearsal or a real-account
   end-to-end acceptance result.

## Verification Evidence

- Storefront Playwright release gate: 3/3 checks passed across desktop and
  mobile registration plus mobile submission confirmation, including strict
  runtime, console, request, HTTP-status, and horizontal-overflow checks.
- IMS registration-review accessibility test: 1/1 passed, covering focus trap,
  Escape close, focus restoration, scroll lock, and semantic descriptions.
- Storefront focused registration service/component tests: 2/2 passed.
- Targeted backend registration, materialization, upload-review, admin, and
  registration-industry regression suites: 15 suites, 84/84 tests passed.
- Storefront and IMS production builds passed; IMS quiet lint passed. The
  repository's existing large-chunk build warning remains non-blocking.
- Disposable landlord migration rehearsal passed all four `20260926`
  registration migrations; a second pass executed zero migrations, required
  tables/columns were verified, and the disposable database was removed.
- Authenticated browser acceptance with real accounts, full
  registration-to-admin E2E, live compliance preflight, PR review, merge, and
  deployed QA remain required before release promotion.
- The front-matter preflight fields retain the repository's PR-open
  `NOT-EXECUTED-*` handoff convention; the live compliance preflight was not
  executed in this local-only worktree.
