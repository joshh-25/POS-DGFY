---
status: reference
authority_level: reference
owner: operations
last_reviewed: 2026-06-19
applies_to: production_release, dgfy_company_access, dgfy_customer_account, storefront, pos, observability
topic: current_production_release_state
---

# Current Production Release State - 2026-06-19

This document records the current production state using deploy evidence, live health output, and release-gate artifacts. Do not use source `HEAD` alone as live-production proof.

## Proof Snapshot

Production proof refreshed on 2026-06-19 Asia/Manila from live VPS state:

- Production remote `HEAD`: `207aa434b4627020cbd286f5e6b5baaf8cebe57a`
- Production `.deploy-state/last_deployed_commit`: `207aa434b4627020cbd286f5e6b5baaf8cebe57a`
- Latest production deploy summary path: `/var/www/skupervisor/logs/deploy/deploy_20260619_105411.summary.txt`
- Deploy summary `deployed_head`, `remote_head`, and `expected_commit`: `207aa434b4627020cbd286f5e6b5baaf8cebe57a`
- Live production `/api/v1/health` reports `services.observability.runtime_sha=207aa434b4627020cbd286f5e6b5baaf8cebe57a` with source `deploy_state:last_deployed_commit`.
- Live production `/api/v1/health` reports database, Redis, runtime schema, schema indexes, billing telemetry, and observability as healthy. Tenant pool capacity is a warning at 20 active tenants out of 20 capacity.
- Frontend asset parity status in the deploy summary: `pass`
- `migrations_changed=0`
- `total_changed_files=0` for the deploy rerun, because the target commit was already checked out on the production server.
- `tenant_schema_sync_require_zero=1`; the summary records tenant schema sync report output and tenant index headroom report output with `tenant_index_headroom_strict=0`.

## Release Gate Evidence

No-staging release verdict for the current deployed SHA:

- Artifact: `.tmp/release-gates/207aa434b4627020cbd286f5e6b5baaf8cebe57a/release_verdict.json`
- Verdict: `bypassed`
- Failed gates: `1`
- Failed gate: stale QA deploy-summary SHA parity before production promotion (`deployed_head=27e5ce1249136ef8676392fec5b6e2c027d459e5`; `target_sha=207aa434b4627020cbd286f5e6b5baaf8cebe57a`)
- Passing gates include deploy source contract, docs lint, architecture guardrails, merge-adoption required check, QA smoke, rollback drill, restore drill, and observability report evidence.
- Emergency bypass reason: stale QA deployed-head evidence before production promotion; source contract, docs, architecture, QA smoke, rollback, restore, and observability report gates passed for the exact target SHA.
- Post-deploy proof closes the runtime parity risk for this deployed SHA: production deploy summary, remote head, expected commit, live `/api/v1/health.services.observability.runtime_sha`, and frontend asset parity all match `207aa434b4627020cbd286f5e6b5baaf8cebe57a`.

Observability evidence:

- Artifact: `.tmp/release-gates/207aa434b4627020cbd286f5e6b5baaf8cebe57a/observability_evidence.json`
- Verdict: `pass` in report mode
- `trace_context.round_trip`: pass
- `health.runtime_sha.present`: pass
- `health.runtime_sha.matches_target`: pass after the guarded production deploy; the pre-deploy no-staging report still recorded stale runtime proof and was covered by the documented emergency bypass metadata.
- `qa.deploy.summary.sha_match.reviewed`: pass, because the mismatch was recorded with explicit emergency bypass metadata
- Metrics reachability is warning-only because `METRICS_ENABLED` is not true for that gate run.

## Production-Live Scope

The current production runtime includes the branch and PR adoption chain from the earlier proven production SHA through `207aa434`:

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

## Production Data Repair Notes

On June 18, 2026, a controlled production data repair linked `DgfyAccountTenantMembership.id=2` for `Kusina & Cafe` tenant `9277ba56-f2e8-4422-9014-5205f74560f7` to tenant-local `users.user_id=1`, set `tenants.owner_dgfy_account_id=06e8e779-6de0-4f81-b3f5-b2beb104ebf2`, confirmed the landlord email-to-tenant mapping already existed, and wrote `dgfy_account_business_audit_logs.audit_log_id=3` with action `legacy_link_completed`. The server-side `createTenantSessionForDgfyAccount({ account, tenantId })` check returned a tenant session with `pos:view` and `pos:transact`. This was a data correction under ADR 0028's explicit-membership contract, not a code deploy.

## Recently Production-Deployed With Deferred Live Mutation Proof

The Storefront/POS request consolidation and DGFY account notification/activity slices are now production-deployed in `207aa434b4627020cbd286f5e6b5baaf8cebe57a`. Read-only production checks confirmed the deployed runtime SHA and that the protected notification list and SSE endpoints reject unauthenticated requests cleanly.

This production proof did not create or mutate a live customer order. The live POS-status-to-DGFY-activity propagation and in-app notification creation path is proven by focused local backend/frontend tests and deploy inclusion, but it still requires controlled production UAT before it can be called live-mutation proven. Notification delivery is in-app only for this slice; browser push, SMS, email, and closed-browser delivery remain out of scope. SSE fanout is in-process with polling fallback; Redis is healthy in production but Redis pub/sub fanout has not been implemented.

## Remaining Release Caveats

These items are still not closed by the current production proof:

1. Authenticated cashier/admin human UAT remains required before rating POS shift/open-close workflows as fully operator-proven.
2. Installed iMin devices still require APK install and real-device cashier smoke; repository source and local APK build proof do not update physical devices by themselves.
3. Tenant schema sync residual risk for older/test-like tenant schemas remains tracked separately from this release state. Do not add unresolved failures to `backend/config/deploy/tenant-schema-sync-failure-baseline.json` without an accepted-risk decision.
4. Tenant pool capacity is at the configured limit and should be handled as an operational capacity task, not as a failed deploy.
5. Controlled production UAT is still needed to prove live customer order status changes create account notifications and update the open tracking/dashboard surfaces in production.
6. Tenant index headroom currently runs non-strict in deploy because the report has redundant-index warnings with `critical=0`; keep this as operational database cleanup rather than a release-blocking failure until an accepted-risk decision changes the gate.

## References

- `docs/testing/release-go-no-go-checklist.md`
- `docs/ops/NO_STAGING_RELEASE_STANDARD.md`
- `docs/ops/PRODUCTION_OBSERVABILITY_RUNBOOK.md`
- `docs/ops/MERGE_ADOPTION_GATE.md`
- `System_Audit/README.md`
