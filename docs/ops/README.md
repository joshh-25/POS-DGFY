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
12. `docs/ops/MENU_IMPORT_BATCH_ENABLEMENT.md`
13. `docs/ops/SOPS_SECRETS_CUTOVER_RUNBOOK.md` — planned production secrets
    cutover (ADR 0060), not yet executed; see that ADR for the decision and
    this runbook for the phased plan + rollback.

Production deploys only on a manual dispatch of `deploy-main.yml` (renamed
from `build-main.yml`, which lost its `push: [main]` trigger 2026-08-14,
#417 — every auto-build/auto-deploy trigger in the repo was removed the same
day). Merging into `main` no longer deploys by itself. See
`docs/ops/RELEASE_CANDIDATE_POLICY.md` for the actual `develop -> staging
-> release/* -> main` flow and what gates it. `docs/ops/
DEVELOPMENT_TO_PRODUCTION_WORKFLOW.md` and ADR 0030 describe an external
signed release controller that was never built for this repository and are
now marked superseded/deprecated; kept as historical record only.
