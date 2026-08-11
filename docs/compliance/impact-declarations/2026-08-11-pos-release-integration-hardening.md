---
status: reference
owner: engineering
last_reviewed: 2026-08-11
declaration_id: 2026-08-11-pos-release-integration-hardening
classification: regulatory
surfaces: pos,terminal,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.08.07
verification_evidence: Phase 41 focused backend and frontend tests,isolated tenant-schema reconciliation,architecture guardrails,tenant schema registry coverage,POS production build,post-merge Phase 42 regression and Playwright qualification
rollback_note: Revert the affected domain commits in reverse dependency order; do not reverse tenant migrations until dependent application code is removed and retained tenant data is assessed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-11T00:00:00+08:00
preflight_request_ref: POS-RELEASE-INTEGRATION-PHASE42-20260811
---

# POS Release Integration Hardening

## Compliance Impact Classification

Regulatory. The release inventory changes cashier identity and shift access,
Day Close PIN authorization, recognized-sales reporting, Z-reading generation,
payment-method disclosure, receipt and report printing, and physical-device
audit evidence. It also carries Storefront order finalization and F&B tenant
schema changes that must remain consistent with POS financial records.

The implementation does not weaken tenant, location, cashier, payment,
fiscal-document, or append-only audit boundaries. Phase 42 preserves the work
as separate reviewable commits and qualifies the merged result before a draft
pull request into `develop`.

## Affected Surfaces

1. DGFY-to-POS handoff, company switching, cashier credential authority, and
   cashier-owned Day Close PIN setup.
2. POS open, resume, and close-shift behavior plus post-shift Z-reading access.
3. Recognized-sales, void, payment-method, and Z-reading report aggregation.
4. Browser, iMin, and LAN receipt/report printing and physical-action audit
   confirmation.
5. Storefront cart isolation, OTP checkout, order finalization, service and
   delivery lifecycle behavior.
6. F&B modifier inheritance and additive tenant-schema migration coverage.

## Compliance Preconditions

1. Every POS mutation remains tenant-, location-, terminal-, and cashier-scoped.
2. Day Close authorization remains personal to the authenticated user; PINs
   and account passwords are never persisted in source, logs, browser evidence,
   or committed environment files.
3. Z-reading generation remains blocked while any branch cashier shift is open,
   and generation produces immutable accountability evidence.
4. Recognized sales remain completed-only; POS void disclosure does not
   double-subtract totals, and provider refunds remain owned by the provider
   settlement ledger.
5. A successful payment is not represented as a successful order until durable,
   idempotent order finalization is confirmed.
6. Physical print and drawer actions remain distinct from backend audit
   confirmation so retries cannot repeat a successful physical action.
7. Additive F&B migrations must pass tenant registry, forward-application, and
   isolated-schema reconciliation before promotion.
8. This declaration authorizes qualification and a draft PR to `develop` only;
   it does not authorize staging, `main`, migration deployment, or production.

## Verification Evidence

1. Phase 41 recorded 21 focused backend unit assertions, 12 focused frontend
   assertions, and 16 isolated-schema integration/migration assertions passing.
2. Phase 41 recorded targeted lint with no errors, the POS production build,
   architecture guardrails, governed-doc lint, and ADR lint passing.
3. The Phase 42 pre-commit audit found no `DO NOT COMMIT` markers, credential
   files, generated test reports, or whitespace errors in the release inventory.
4. Every domain commit must pass the applicable pre-commit architecture,
   migration-registry, and compliance checks.
5. After merging the latest `dgfy-platform/develop`, Phase 42 must rerun
   migrations, architecture and documentation gates, focused/full regression
   tests, affected production builds, and maintained Playwright flows.
6. Any unavailable physical-printer or authenticated-browser evidence must be
   disclosed as a residual risk in the draft pull request and may not be
   represented as passed.
