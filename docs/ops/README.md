# Operations Docs

When to use:
1. Production checklists and operational runbooks
2. Readiness and incident-prevention controls
3. System operations assurance procedures

Key runbooks:
1. `docs/ops/PRODUCTION_CHECKLIST.md`
2. `docs/ops/NO_STAGING_RELEASE_STANDARD.md`
3. `docs/ops/PRODUCTION_OBSERVABILITY_RUNBOOK.md`
4. `docs/ops/CURRENT_PRODUCTION_RELEASE_2026-06-18.md`
5. `docs/ops/MERGE_ADOPTION_GATE.md`
6. `docs/ops/DEVELOPER_DEPLOYMENT_HANDOFF.md`
7. `docs/ops/WORKSPACE_CLEANUP_AND_BRANCH_POLICY.md`
8. `docs/ops/RELEASE_CANDIDATE_POLICY.md`
9. `docs/ops/QA_ISOLATION_PROFILE.md`
10. `docs/ops/BETA_TENANT_PROVISIONING_INCIDENT_2026-07-04.md`
11. `docs/ops/STOREFRONT_TRACKING_POLL_RATE_LIMIT_INVESTIGATION.md`

Merging into `main` deploys production directly (`build-main.yml` on push);
see `docs/ops/RELEASE_CANDIDATE_POLICY.md` for the actual `develop -> staging
-> release/* -> main` flow and what gates it. `docs/ops/
DEVELOPMENT_TO_PRODUCTION_WORKFLOW.md` and ADR 0030 describe an external
signed release controller that was never built for this repository and are
now marked superseded/deprecated; kept as historical record only.
