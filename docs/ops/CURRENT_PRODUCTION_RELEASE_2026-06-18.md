---
status: reference
authority_level: reference
owner: operations
last_reviewed: 2026-06-22
applies_to: production_release, dgfy_company_access, dgfy_customer_account, storefront, pos, observability
topic: current_production_release_state
---

# Current Production Release State - 2026-06-22

This document records the current production state using deploy evidence, live health output, and release-gate artifacts. Do not use source `HEAD` alone as live-production proof.

Source-only documentation or test-hardening commits may exist after the deployed SHA. Treat production remote `HEAD`, `.deploy-state/last_deployed_commit`, the deploy summary, and live `/api/v1/health.services.observability.runtime_sha` as the current live contract until the next guarded production deploy updates all four proof points.

## Proof Snapshot

Production proof refreshed on 2026-06-22 Asia/Manila from live VPS state:

- Production remote `HEAD`: `9c03af78bfe2847031cfa383896b9b92e08ef6f7`
- Production `.deploy-state/last_deployed_commit`: `9c03af78bfe2847031cfa383896b9b92e08ef6f7`
- Latest production deploy summary path: `/var/www/skupervisor/logs/deploy/deploy_20260622_090059.summary.txt`
- Deploy summary `deployed_head` and `remote_head`: `9c03af78bfe2847031cfa383896b9b92e08ef6f7`
- Deploy summary `expected_commit`: `none`, because the final manual SSH deploy intentionally omitted `--expect-commit` after PowerShell CRLF corrupted remote arguments in earlier attempts. Post-deploy proof below is the current runtime SHA authority for this deploy.
- Live production `/api/v1/health` reports `services.observability.runtime_sha=9c03af78bfe2847031cfa383896b9b92e08ef6f7` with source `deploy_state:last_deployed_commit`.
- Live production `/api/v1/health` reports database, Redis, runtime schema, schema indexes, billing telemetry, and observability as healthy. Tenant pool capacity is a warning at 20 active tenants out of 20 capacity.
- Frontend asset parity status in the deploy summary: `pass`
- `migrations_changed=0`
- `total_changed_files=0` for the successful deploy rerun, because the target commit was already present on the production server before the final PM2/build reload.
- `tenant_schema_sync_require_zero=1`; the summary records tenant schema sync report output and tenant index headroom report output with `tenant_index_headroom_strict=0`.

## Release Gate Evidence

No-staging release verdict for the current deployed SHA:

- Artifact: `.tmp/release-gates/9c03af78bfe2847031cfa383896b9b92e08ef6f7/release_verdict.json`
- Verdict: `bypassed`
- Failed gates: multiple QA evidence/configuration gates, including invalid or missing `QA_COMPANY_TOKEN`, rollback drill, restore drill, missing QA deploy summary, and stale pre-deploy live runtime SHA evidence.
- Passing local/release gates for the exact target SHA included focused backend geo/business-hours tests, focused frontend MapPinPicker/onboarding/Settings/business-hours/service-worker tests, SKUpervisor and Storefront builds, docs lint, architecture guardrails, compliance, whitespace, route-level rendered QA on the real SKUpervisor runtime, deploy source contract, and merge-adoption required check.
- Emergency bypass reason: the owner explicitly authorized emergency production deployment after the map/hours hotfix passed local gates and real route-level rendered QA, while the no-staging QA evidence inputs remained non-standardized and blocked the wrapper. This is current release-process debt and must not be treated as a clean no-bypass release.
- Post-deploy proof closes the runtime inclusion risk for this deployed SHA: production deploy summary, remote head, `.deploy-state/last_deployed_commit`, live `/api/v1/health.services.observability.runtime_sha`, live PH-local reverse geocode, deployed source checks, deployed bundle checks, and frontend asset parity all match or contain the `9c03af78bfe2847031cfa383896b9b92e08ef6f7` hotfix.

Observability evidence:

- Artifact: `.tmp/release-gates/9c03af78bfe2847031cfa383896b9b92e08ef6f7/observability_evidence.json`
- Verdict: `pass` in report mode
- `trace_context.round_trip`: pass
- `health.runtime_sha.present`: pass
- `health.runtime_sha.matches_target`: pass after the emergency production deploy; the pre-deploy no-staging report still recorded stale runtime proof and was covered by the documented emergency bypass metadata.
- `qa.deploy.summary.sha_match.reviewed`: pass, because the mismatch was recorded with explicit emergency bypass metadata
- Metrics reachability is warning-only because `METRICS_ENABLED` is not true for that gate run.

## Production-Live Scope

The current production runtime includes the branch and PR adoption chain from the earlier proven production SHA through `b8132a19`:

- DGFY company access hardening: explicit DGFY membership model, DGFY-only invitations, company switching, ownership transfer hardening, legacy-link grace behavior, and DGFY POS unlock.
- DGFY customer and Storefront flow: handoff-token return flow, guest/account checkout chooser, saved address behavior, tracking drawer, updated account dashboard, no customer-visible `company_token`, and no silent same-email guest adoption into signed-in account history.
- Storefront display and cosmetics: discovery/header account entry, F&B mobile hero stabilization, F&B details, Storefront styles, discovery relevance ranking, search-result pin fallback, and restored updated customer dashboard layout.
- POS safety and operations: persistent terminal lock, DGFY POS unlock, shift open/close safety, opening cash requirement, closed-shift mutation blocking, discount validation, hardware message modal/bus, receipt print updates, and reconciliation coverage.
- CSRF and POS terminal sequencing remediation: shared tenant/admin frontend clients attach `x-csrf-token` for unsafe cookie-authenticated requests, and the dedicated POS app remains locked until explicit terminal unlock before prompting to open a shift.
- iMin receipt preview hotfix: the POS receipt preview modal uses an internally scrollable content area so the paper selector and print action remain reachable on constrained iMin screens.
- Security/session hardening: DGFY return-target allowlist, browser-readable token storage guard expansion, HttpOnly cookie-session continuity, and DGFY cookie fallback store-auth behavior that does not claim same-email tenant-local customers without explicit `dgfy_account_id`.
- Production traceability: runtime SHA in health, trace/request header round-trip, sanitized structured request outcome logging, incident bundle generation, and report-mode observability gate proof.
- PR #18 Storefront discovery closeout: Fuse.js relevance ranking, search-result pin fallback, unreachable legacy discovery block removal, related tests/docs, and root `bun.lock` ignore rule.
- PR #20 POS and DGFY Storefront closeout: POS safety and DGFY Storefront customer-flow updates are in `master` and included in the deployed runtime chain.
- Storefront/POS browser-authenticated request consolidation: Storefront requests use the shared `requestJson` session/CSRF helper, hospitality booking inherits the same browser-session contract, and IMS/POS development auto-login uses the shared tenant login/session service.
- DGFY account-owned activity and notification flow: dashboard, activity-list, and account tracking reads refresh already-linked POS order snapshots; online POS status updates upsert account-owned activity, create account-scoped in-app notifications, and publish authenticated SSE events without adopting guest orders by email or phone.
- Storefront account notifications: routed account pages load real unread notification counts, render the bell notification panel, mark notifications read, and listen to `/api/v1/dgfy/customer/events` while account or tracking surfaces are visible with polling fallback.
- Batch findings remediation: active company registration performs cookie-backed IMS tenant-session handoff before dashboard redirect with manual-login fallback copy, explicit customer sign-out suppresses immediate cookie-backed account restoration until a new login/signup or handoff, mobile checkout delivery maps use concrete normal/expanded heights with DGFY-branded controls and MapLibre resize after visibility changes, and the standalone mobile tracking list card has been removed in favor of the side tracking drawer as the canonical in-progress tracker.
- Business-registration IMS handoff hotfix: DGFY tenant-session exchange now emits the same IMS `auth:login` client event as normal tenant login after storing the returned tenant token and company token. This keeps IMS auth/permission listeners in sync before the dashboard renders, reducing the risk of a successful tenant-session exchange still appearing to bounce back to manual login.
- Business-registration provisioning hotfix: tenant provisioning now resolves the seeded tenant-local admin user id even when the production database driver does not expose `insertId` on raw insert metadata, so founder DGFY memberships are linked to the tenant user required by `/api/v1/dgfy/auth/tenant-session`.
- DGFY session-token hardening: normal DGFY JWTs include a unique `jti`, preventing immediate logout-then-login flows from reissuing the same token string that was just blacklisted.
- Delivery map blank-space hardening: `DeliveryPinMap` now uses a deterministic frame/root/canvas layout, `ResizeObserver`, `visualViewport` resize handling, stable mobile height clamps, and rendered QA selectors. The live Storefront bundle contains the map selectors, resize observer path, normal/expanded height clamps, side-tracker copy, and no longer contains the removed standalone tracking-list copy.
- IMS storefront location map hotfix: onboarding and Settings use the shared `MapPinPicker` with explicit locked/adjust modes, `0,0` and out-of-Philippines merchant pins rejected, Iloilo City as camera-only default, same-origin `/openfreemap` MapLibre resources by default, SKUpervisor service-worker bypass for `/openfreemap`, browser geolocation accuracy messaging, and PH-local reverse geocode metadata through first-party `/api/v1/geo/reverse-geocode`.
- Storefront business-hours hotfix: onboarding, Settings, public Storefront display, and order/service-hour gates normalize multi-interval weekly schedules, preserve legacy one-window schedules, validate overlapping intervals, and render split schedules compactly on desktop and mobile.

## Production Data Repair Notes

On June 18, 2026, a controlled production data repair linked `DgfyAccountTenantMembership.id=2` for `Kusina & Cafe` tenant `9277ba56-f2e8-4422-9014-5205f74560f7` to tenant-local `users.user_id=1`, set `tenants.owner_dgfy_account_id=06e8e779-6de0-4f81-b3f5-b2beb104ebf2`, confirmed the landlord email-to-tenant mapping already existed, and wrote `dgfy_account_business_audit_logs.audit_log_id=3` with action `legacy_link_completed`. The server-side `createTenantSessionForDgfyAccount({ account, tenantId })` check returned a tenant session with `pos:view` and `pos:transact`. This was a data correction under ADR 0028's explicit-membership contract, not a code deploy.

## Controlled Production Mutation UAT

The final controlled production mutation UAT for DGFY signup, explicit logout, email-prefilled re-login, company registration, IMS tenant-session handoff, second tenant-session non-rate-limit behavior, founder membership persistence, and QA cleanup passed on 2026-06-20 against live runtime SHA `dfa0da7d8cc1e6cc485618371dc2bb40c3942609`.

Evidence: `.tmp/production-uat/dgfy-business-handoff/evidence-20260620054511.json`. The run created a timestamped QA DGFY account and company through production APIs, proved `/api/v1/dgfy/auth/tenant-session` returned an IMS tenant token, proved a second tenant-session call was not rate-limited by the dedicated limiter, inspected the landlord membership/ownership link, and removed the QA account, tenant, membership, legal acknowledgements, and tenant database afterward. Earlier same-day UAT attempts found and cleaned up two real issues before this passing run: missing founder `tenant_user_id` linkage after tenant provisioning and immediate re-login token collision after explicit logout.

Live customer order mutation, live POS-status-to-DGFY-activity propagation, and live checkout delivery-map pin placement remain outside this final UAT. Those paths are covered by focused local backend/frontend tests, rendered local checkout-map smoke at mobile widths, live asset inclusion, and deploy inclusion, but still need a separate approved production order/check-out mutation run before being called live-order proven. Notification delivery is in-app only for this slice; browser push, SMS, email, and closed-browser delivery remain out of scope. SSE fanout is in-process with polling fallback; Redis is healthy in production but Redis pub/sub fanout has not been implemented.

## Remaining Release Caveats

These items are still not closed by the current production proof:

1. Authenticated cashier/admin human UAT remains required before rating POS shift/open-close workflows as fully operator-proven.
2. Installed iMin devices still require APK install and real-device cashier smoke; repository source and local APK build proof do not update physical devices by themselves.
3. Tenant schema sync residual risk for older/test-like tenant schemas remains tracked separately from this release state. Do not add unresolved failures to `backend/config/deploy/tenant-schema-sync-failure-baseline.json` without an accepted-risk decision.
4. Tenant pool capacity is at the configured limit and should be handled as an operational capacity task, not as a failed deploy.
5. Controlled production order UAT is still needed to prove live customer order status changes create account notifications and update the open tracking/dashboard surfaces in production.
6. Tenant index headroom currently runs non-strict in deploy because the report has redundant-index warnings with `critical=0`; keep this as operational database cleanup rather than a release-blocking failure until an accepted-risk decision changes the gate.
7. The June 22 map/hours hotfix deploy used emergency bypass because QA environment/evidence inputs were not standardized. Before the next routine release, fix the CRLF-safe deploy invocation path, linked-worktree push behavior, QA token/env-file contract, and rollback/restore drill setup so the no-staging gate can pass without emergency metadata.
8. Production route-level authenticated rendered QA for onboarding and Settings was not rerun after deploy with production credentials. Local seeded route-level QA and deployed bundle/source/live API checks prove inclusion; a controlled production browser pass remains recommended before treating the UX as human-production-proven.

## References

- `docs/testing/release-go-no-go-checklist.md`
- `docs/ops/NO_STAGING_RELEASE_STANDARD.md`
- `docs/ops/PRODUCTION_OBSERVABILITY_RUNBOOK.md`
- `docs/ops/MERGE_ADOPTION_GATE.md`
- `System_Audit/README.md`
