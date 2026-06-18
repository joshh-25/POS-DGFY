---
status: reference
authority_level: reference
owner: operations
last_reviewed: 2026-06-18
applies_to: production_release, dgfy_company_access, dgfy_customer_account, storefront, pos, observability
topic: current_production_release_state
---

# Current Production Release State - 2026-06-18

This document records the current production state using deploy evidence, live health output, and release-gate artifacts. Do not use source `HEAD` alone as live-production proof.

## Proof Snapshot

Production proof collected on 2026-06-18:

- Local `master`: `5caa201cb0468106fef859501181024f93746c49`
- Local `origin/master`: `5caa201cb0468106fef859501181024f93746c49`
- Latest deploy summary evidence: `.tmp/release-gates/5caa201cb0468106fef859501181024f93746c49/qa_deploy_summary.txt`
- Production deploy summary path recorded by the fetched evidence: `/var/www/skupervisor/logs/deploy/deploy_20260618_104004.summary.txt`
- Deploy summary `deployed_head`, `remote_head`, and `expected_commit`: `5caa201cb0468106fef859501181024f93746c49`
- Live production `/api/v1/health` reports `services.observability.runtime_sha=5caa201cb0468106fef859501181024f93746c49` with source `deploy_state:last_deployed_commit`.
- Live production `/api/v1/health` reports database, Redis, runtime schema, schema indexes, billing telemetry, and observability as healthy. Tenant pool capacity is a warning at 19 active tenants out of 20 capacity.
- Frontend asset parity status in the deploy summary: `pass`
- `migrations_changed=0`
- `total_changed_files=0` for the deploy rerun, because the target commit was already checked out on the production server.

## Release Gate Evidence

No-staging release verdict:

- Artifact: `.tmp/release-gates/5caa201cb0468106fef859501181024f93746c49/release_verdict.json`
- Verdict: `pass`
- Failed gates: `0`
- Passing gates include docs lint, architecture guardrails, QA smoke, rollback drill, restore drill, QA deploy-summary SHA parity, and observability report evidence.
- No emergency bypass was used.

Observability evidence:

- Artifact: `.tmp/release-gates/5caa201cb0468106fef859501181024f93746c49/observability_evidence.json`
- Verdict: `pass` in report mode
- `trace_context.round_trip`: pass
- `health.runtime_sha.present`: pass
- `health.runtime_sha.matches_target`: pass
- `qa.deploy.summary.sha_match.reviewed`: pass
- Metrics reachability is warning-only because `METRICS_ENABLED` is not true for that gate run.

## Production-Live Scope

The current production runtime includes the branch and PR adoption chain from the earlier proven production SHA through `5caa201c`:

- DGFY company access hardening: explicit DGFY membership model, DGFY-only invitations, company switching, ownership transfer hardening, legacy-link grace behavior, and DGFY POS unlock.
- DGFY customer and Storefront flow: handoff-token return flow, guest/account checkout chooser, saved address behavior, tracking drawer, updated account dashboard, no customer-visible `company_token`, and no silent same-email guest adoption into signed-in account history.
- Storefront display and cosmetics: discovery/header account entry, F&B mobile hero stabilization, F&B details, Storefront styles, discovery relevance ranking, search-result pin fallback, and restored updated customer dashboard layout.
- POS safety and operations: persistent terminal lock, DGFY POS unlock, shift open/close safety, opening cash requirement, closed-shift mutation blocking, discount validation, hardware message modal/bus, receipt print updates, and reconciliation coverage.
- Security/session hardening: DGFY return-target allowlist, browser-readable token storage guard expansion, HttpOnly cookie-session continuity, and DGFY cookie fallback store-auth behavior that does not claim same-email tenant-local customers without explicit `dgfy_account_id`.
- Production traceability: runtime SHA in health, trace/request header round-trip, sanitized structured request outcome logging, incident bundle generation, and report-mode observability gate proof.
- PR #18 Storefront discovery closeout: Fuse.js relevance ranking, search-result pin fallback, unreachable legacy discovery block removal, related tests/docs, and root `bun.lock` ignore rule.
- PR #20 POS and DGFY Storefront closeout: POS safety and DGFY Storefront customer-flow updates are in `master` and included in the deployed `5caa201c` runtime chain.

## Remaining Release Caveats

These items are still not closed by the June 18 production proof:

1. Authenticated cashier/admin human UAT remains required before rating POS shift/open-close workflows as fully operator-proven.
2. Installed iMin devices still require APK install and real-device cashier smoke; repository source and local APK build proof do not update physical devices by themselves.
3. Tenant schema sync residual risk for older/test-like tenant schemas remains tracked separately from this release state. Do not add unresolved failures to `backend/config/deploy/tenant-schema-sync-failure-baseline.json` without an accepted-risk decision.
4. Tenant pool capacity is close to the configured limit and should be handled as an operational capacity task, not as a failed deploy.

## References

- `docs/testing/release-go-no-go-checklist.md`
- `docs/ops/NO_STAGING_RELEASE_STANDARD.md`
- `docs/ops/PRODUCTION_OBSERVABILITY_RUNBOOK.md`
- `docs/ops/MERGE_ADOPTION_GATE.md`
- `System_Audit/README.md`
