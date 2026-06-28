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
8. `docs/ops/DEVELOPMENT_TO_PRODUCTION_WORKFLOW.md`
9. `docs/ops/QA_ISOLATION_PROFILE.md`

Production authorization for the private GitHub Free repository is enforced by ADR 0030 at the root-owned external signed release controller. GitHub workflows create candidate evidence and PRs only.
