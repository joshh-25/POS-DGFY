---
status: reference
authority_level: reference
owner: operations
last_reviewed: 2026-06-29
applies_to: production_release, staging_release, dgfy_company_access, dgfy_customer_account, storefront, pos, observability
topic: current_production_release_state
---

# Current Production Release State - 2026-06-29

This document records the current production and staging state using deploy evidence, live health output, and remote branch proof. Do not use source `HEAD` alone as live-production proof.

Production truth is the deployed runtime SHA. Staging truth is the current `origin/staging` SHA. These can differ because staging also carries integration/governance commits that are not deployed production runtime until a later governed `staging -> master -> production` promotion.

## Proof Snapshot

Production proof refreshed on 2026-06-29 Asia/Manila from live VPS state:

- Production remote checkout: `/var/www/skupervisor`
- Production remote `HEAD`: `17bb4cd1bc0abf283b224e30c02f625884e8ffae`
- Production `.deploy-state/last_deployed_commit`: `17bb4cd1bc0abf283b224e30c02f625884e8ffae`
- Live production `/api/v1/health` reports `services.observability.runtime_sha=17bb4cd1bc0abf283b224e30c02f625884e8ffae` with source `deploy_state:last_deployed_commit`.
- Live production `/api/v1/health` reports database, Redis, runtime schema, schema indexes, billing telemetry, and observability as healthy.
- Tenant pool capacity remains an operational warning at 20 active tenants out of 20 capacity.
- Live Storefront tracking smoke for `GET https://dgfy.ph/api/v1/store/track/SK-2MIBVL` with `x-store-slug: eatery-ni-doe-2e561d` returned `200`, `status=placed`, and `status_label=Order placed`.
- The production server did not expose a deploy-summary file in `.deploy-state/` for this emergency run; the authoritative proof for this snapshot is remote `HEAD`, `.deploy-state/last_deployed_commit`, live health runtime SHA, and the live Storefront tracking API smoke.

Staging branch proof refreshed on 2026-06-29:

- `origin/master`: `17bb4cd1bc0abf283b224e30c02f625884e8ffae`
- Current `origin/staging`: `04eecf32b3801444d22be84984564933b357b768`
- `origin/staging` contains production commit `17bb4cd1bc0abf283b224e30c02f625884e8ffae`.
- `b3e23ef3e0e2abcb8637bc59fca4ac12d1e4e9de` is the staging merge commit that preserved staging-only release-governance work and merged the deployed production hotfix stack into staging.
- `04eecf32b3801444d22be84984564933b357b768` is the docs-only staging head that refreshed this production/staging release-state documentation after the merge.

## Release Gate Evidence

The June 29 Storefront tracking hotfix used the documented emergency bypass path because the configured QA deploy-summary/runtime parity evidence was stale/unusable and QA promotion was intentionally disabled for the urgent production fix.

Focused pre-deploy and staging-merge validation passed:

- `npm --prefix frontend test -- --run apps/store/src/__tests__/customerTrackingRefresh.test.js apps/store/src/__tests__/storefrontErrorMessages.test.js apps/store/src/__tests__/fnbStorefront.contract.test.js apps/store/src/__tests__/requestJson.csrfSession.test.js` passed 4 files / 38 tests.
- `npm --prefix backend test -- --runTestsByPath tests/rateLimiter.behavior.test.js tests/cachePolicy.routeContracts.test.js --runInBand` passed 2 suites / 9 tests.
- `npm --prefix frontend run build:store` passed.
- `npm run check:architecture` passed.
- `npm run lint:docs` passed.
- `npm run check:compliance` passed.
- `git diff --check` passed, with only existing CRLF normalization warnings on environment example files during the production hotfix pass.
- Desktop and mobile rendered local Storefront tracking QA passed before deployment: nonblank route, no framework overlay, visible tracking status, and zero relevant console errors/warnings.

The staging merge validation also passed after merging production into staging:

- Focused frontend tracking/Storefront tests passed 4 files / 38 tests.
- Focused backend rate-limiter/cache-policy tests passed 2 suites / 9 tests.
- Storefront production build passed.
- Architecture, docs lint, compliance, and whitespace checks passed after updating compliance declaration surface metadata for the merged hotfix stack.

## Production-Live Scope Added By The June 29 Hotfix Stack

The current production runtime includes the previous June production chain plus these June 29 hotfixes:

- POS terminal checkout grid layout restoration: the terminal catalog/current-sale columns no longer compress into unusably narrow panes on wide screens.
- DGFY signup OTP stale-tenant-context fix: landlord-global DGFY account verification OTP requests ignore stale tenant context and remain aligned with the global DGFY registration verifier.
- F&B item/product draft finalization and create-preset normalization: F&B create/edit flows use F&B-supported presets and complete item creation without sending unsupported manufacturing defaults.
- Storefront settings POS metadata scope fix: Storefront settings saves do not submit POS receipt metadata fields into the platform-admin approval workflow.
- Bulk POS setup modal handoff: opening Bulk POS Setup from item/product create-edit closes the source wizard so the POS setup modal is not hidden behind it.
- Storefront order tracking route/refresh stabilization: tracking routes are mode-independent, customer tracking refresh is state-aware, and request storms no longer turn normal customer tracking into a repeated hard-error experience.
- Storefront tracking rate-limit customer-experience improvement: public tracking reads use a dedicated IP + store context + tracking-PIN bucket, manual retry is disabled during server cooldown, the last successful tracking result is preserved when possible, and customer-facing copy explains temporary refresh throttling without losing the order PIN.

## Source-Current Versus Production-Live

The repository may be ahead of production after this docs-only cleanup. Treat new docs/cleanup/branch-maintenance commits as source-current only until a later governed production deployment records matching production proof.

Production-live runtime remains `17bb4cd1bc0abf283b224e30c02f625884e8ffae` until the next deploy updates remote `HEAD`, `.deploy-state/last_deployed_commit`, and live health runtime SHA.

Staging currently includes production plus staging-only governance history through merge commit `b3e23ef3e0e2abcb8637bc59fca4ac12d1e4e9de`, with docs-only head `04eecf32b3801444d22be84984564933b357b768`. Neither staging SHA is production-live.

## Remaining Release Caveats

These items are still not closed by the current production proof:

1. Authenticated cashier/admin human UAT remains required before rating POS shift/open-close workflows as fully operator-proven.
2. Installed iMin devices still require APK install and real-device cashier smoke; repository source and local APK build proof do not update physical devices by themselves.
3. Tenant schema sync residual risk for older/test-like tenant schemas remains tracked separately from this release state. Do not add unresolved failures to `backend/config/deploy/tenant-schema-sync-failure-baseline.json` without an accepted-risk decision.
4. Tenant pool capacity is at the configured limit and should be handled as an operational capacity task, not as a failed deploy.
5. Controlled production order UAT is still needed to prove live customer order status changes create account notifications and update the open tracking/dashboard surfaces in production.
6. Tenant index headroom currently runs non-strict in deploy because the report has redundant-index warnings with `critical=0`; keep this as operational database cleanup rather than a release-blocking failure until an accepted-risk decision changes the gate.
7. The June 29 Storefront tracking deploy used emergency bypass because QA deploy-summary/runtime parity evidence was stale/unusable. A routine release still needs exact isolated QA parity without emergency bypass before closing the stale-QA release-evidence finding.
8. The live 429 cooldown UI path was not naturally reproduced after the production bucket cleared; focused frontend/backend tests cover the cooldown behavior and live tracking returned normal `200` status for the known PIN.

## Production Data Repair Notes

On June 18, 2026, a controlled production data repair linked `DgfyAccountTenantMembership.id=2` for `Kusina & Cafe` tenant `9277ba56-f2e8-4422-9014-5205f74560f7` to tenant-local `users.user_id=1`, set `tenants.owner_dgfy_account_id=06e8e779-6de0-4f81-b3f5-b2beb104ebf2`, confirmed the landlord email-to-tenant mapping already existed, and wrote `dgfy_account_business_audit_logs.audit_log_id=3` with action `legacy_link_completed`. The server-side `createTenantSessionForDgfyAccount({ account, tenantId })` check returned a tenant session with `pos:view` and `pos:transact`. This was a data correction under ADR 0028's explicit-membership contract, not a code deploy.

## Controlled Production Mutation UAT

The final controlled production mutation UAT for DGFY signup, explicit logout, email-prefilled re-login, company registration, IMS tenant-session handoff, second tenant-session non-rate-limit behavior, founder membership persistence, and QA cleanup passed on 2026-06-20 against live runtime SHA `dfa0da7d8cc1e6cc485618371dc2bb40c3942609`.

Evidence: `.tmp/production-uat/dgfy-business-handoff/evidence-20260620054511.json`.

Live customer order mutation, live POS-status-to-DGFY-activity propagation, and live checkout delivery-map pin placement remain outside that final UAT. Those paths are covered by focused local backend/frontend tests, rendered local checkout-map smoke at mobile widths, live asset inclusion, and deploy inclusion, but still need a separate approved production order/check-out mutation run before being called live-order proven.

## References

- `docs/testing/release-go-no-go-checklist.md`
- `docs/ops/NO_STAGING_RELEASE_STANDARD.md`
- `docs/ops/PRODUCTION_OBSERVABILITY_RUNBOOK.md`
- `docs/ops/MERGE_ADOPTION_GATE.md`
- `docs/ops/DEVELOPMENT_TO_PRODUCTION_WORKFLOW.md`
- `System_Audit/README.md`
