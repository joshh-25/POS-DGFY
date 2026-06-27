---
status: authoritative
authority_level: authoritative
owner: release
last_reviewed: 2026-06-27
applies_to: development_to_production_release_flow
topic: development_to_production_workflow
---

# Development To Production Workflow

## Purpose

This is the authoritative workflow for moving SKU Inventory Manager changes from development into production.

The governed path is:

```text
feature branch -> PR to staging -> exact staging SHA qualification -> distinct QA proof -> staging to master PR -> exact master SHA qualification -> exact origin/master production deploy -> deployed-change accuracy review
```

`staging` is an integration branch. It is not automatically equivalent to a deployed QA/staging environment. Production-current claims require production proof, not source-only state.

## Architecture Classification

Workflow, CI, documentation, and deploy-wrapper changes are normally `no-architecture-impact`.

Create or update an ADR only when a release workflow change also changes application runtime ownership, deployment topology, cross-boundary data contracts, payment behavior, or module boundaries.

Required planning references:

1. `docs/START_HERE.md`
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
3. `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
4. `docs/ops/NO_STAGING_RELEASE_STANDARD.md`
5. `docs/ops/DEPLOYMENT_GUIDE.md`
6. `docs/ops/WORKSPACE_CLEANUP_AND_BRANCH_POLICY.md`
7. `docs/testing/release-go-no-go-checklist.md`

## Branch Model

1. Developers work on feature branches.
2. Developers open PRs into `staging`.
3. The repository owner may push directly to `staging` for local-owner work, but every direct push must pass the same staging qualification workflow.
4. `staging` is the integration branch and promotion candidate source.
5. `master` is production-only.
6. Developers must not push directly to `master`.
7. Production deploys only the exact pushed `origin/master` SHA.

Required protection intent:

1. `master`: direct human pushes blocked, force pushes blocked, deletion blocked, PR required, required checks enforced, unresolved conversations blocked, production secrets scoped to the production environment, and auto-merge limited to promotion automation.
2. `staging`: developer PRs required, owner direct-staging exception allowed, force pushes blocked, deletion blocked, required checks enforced, and production secrets unavailable to untrusted PR code.

Automatic production deployment must remain disabled until branch protection and distinct QA proof are confirmed.

## Batch Inventory

Every promotion candidate must have a batch inventory before promotion.

Command:

```bash
npm run check:batch-inventory -- --base origin/master --head <candidate_sha> --write --require-ship --inventory ".tmp/release-gates/<candidate_sha>/batch_inventory.json" --markdown ".tmp/release-gates/<candidate_sha>/batch_inventory.md"
npm run validate:batch-inventory -- --inventory ".tmp/release-gates/<candidate_sha>/batch_inventory.json" --base origin/master --head <candidate_sha> --require-ship
```

The inventory records one or more release slices. Each slice must include:

1. Slice name and plain-English purpose.
2. Implementation summary.
3. Included files/features and excluded files/features.
4. Owner/source branch or PR reference, including owner direct-staging attribution when applicable.
5. Affected surfaces: backend, frontend, database, scripts/deploy, docs, compliance, POS, Storefront, DGFY, tenant lifecycle, and payments.
6. Risk level.
7. Required tests and completed tests.
8. Required docs.
9. ADR/compliance declaration requirement.
10. Rollback notes.
11. Production proof required.
12. Production accuracy checks required.
13. Payment-sensitive and high-risk path flags.
14. Promotion eligibility and verdict.

No changed file may ride along silently. Every changed file in the candidate diff must belong to exactly one batch.

Payment-sensitive candidates are fail-closed unless explicit payment-release approval is present. PayMongo live split checkout remains blocked unless the PayMongo provider-confirmation contract in ADR 0027 and the PayMongo feature doc is satisfied.

## Staging Qualification

The `Staging Qualification` workflow runs for PRs targeting `staging` and pushes to `staging`. It must not expose QA or production secrets to untrusted PR code.

Required gates are docs lint, architecture checks, compliance checks, dependency audits, production env fixtures, backend matrix, frontend tests, all frontend builds, frontend budgets, browser journey tests, development-to-production script tests, merge-adoption-required, deploy source contract, and batch inventory completeness.

A newer push to `staging` cancels the older staging qualification candidate.

## QA Proof

Automatic promotion beyond staging requires a real QA target.

The QA target must prove `QA_SSH_HOST` and `QA_APP_DIR` identify a real QA checkout, QA is not the production host plus production app directory, QA has isolated database/credentials/tenant data/runtime markers/deploy summaries, browser UAT uses disposable data, and the QA deploy summary includes `deployed_head=<candidate_sha>`.

If no distinct QA target exists, install the workflow in disabled/fail-closed mode. Do not mutate production to create QA evidence.

## Staging To Master Promotion

After staging qualification passes for a push to `staging`, the `Promote Staging To Master` workflow creates or updates the `staging -> master` PR.

The PR body must include batch inventory, validation evidence, artifact references, excluded work, non-goals, merge-adoption proof when required, source contract evidence, and payment-sensitive approval status.

Auto-merge may be enabled only after required checks, branch protection, unresolved conversation blocking, payment safety, and QA proof are all configured.

After merge, the resulting `master` SHA must be requalified. A green `staging` SHA does not automatically prove the merged `master` SHA.

The `Exact Master SHA Qualification` workflow runs on `master` pushes and must pass before production deployment. It verifies `origin/master`, deploy source contract, final batch inventory, docs, architecture, compliance, dependencies, backend matrix, frontend tests/builds/budgets, development-to-production script tests, and final merge-adoption-required proof.

## Production Deployment

Production deployment uses the exact `origin/master` SHA only.

CI entrypoint:

```bash
RELEASE_TARGET_SHA=<origin_master_sha> npm run deploy:prod:ci
```

The CI wrapper requires `RELEASE_TARGET_SHA`, fetches `origin/master`, requires equality, refuses dirty state, never pushes/merges/rebases/prompts, avoids interactive SSH TTY allocation, validates batch inventory and QA target proof, runs deploy source and no-staging gates, then SSHes to production and runs:

```bash
bash scripts/deploy.sh --branch master --expect-commit <sha>
```

Dry-run mode must pass before live enablement:

```bash
PRODUCTION_DEPLOY_DRY_RUN=1 RELEASE_TARGET_SHA=<origin_master_sha> npm run deploy:prod:ci
```

The workflow file is `.github/workflows/deploy-production.yml`. Live automatic deployment remains off unless `ENABLE_AUTO_PRODUCTION_DEPLOY=1`, branch protection is configured, a distinct QA target is proven, failure simulations pass, and the production environment approval policy is active.

The existing local operator command remains valid:

```powershell
& "C:\Program Files\Git\bin\bash.exe" scripts/deploy-remote.sh --yes
```

## Production Proof And Accuracy Review

After deployment, prove production remote `HEAD`, `.deploy-state/last_deployed_commit`, newest deploy summary, `deployed_head`, `remote_head`, `expected_commit`, production deployment contract, frontend asset parity, `/api/v1/health.services.observability.runtime_sha`, endpoint health, and tenant-store asset integrity all match the target.

Then run a deployed-change accuracy review for every shipped batch. A batch is not complete until production behavior accurately reflects the intended inventory or the discrepancy is fixed, explicitly deferred, or documented as residual risk.

Allowed machine-readable accuracy states are `accurately_reflected`, `partially_reflected`, `deployed_but_behavior_not_proven`, `source_current_only`, `docs_overclaim`, and `deployed_but_inaccurate`.

## Required GitHub Settings

Configure these outside repo files.

`master`:

1. Block direct human pushes.
2. Block force pushes and deletion.
3. Require pull requests.
4. Require required status checks, including CI, staging qualification evidence on the promotion PR, exact master SHA qualification, batch inventory validation, merge-adoption-required, and deploy source contract checks.
5. Require unresolved conversations to be resolved before merge.
6. Restrict auto-merge to the promotion automation after required checks pass.
7. Scope production secrets only to the production deployment environment.

`staging`:

1. Require developer PRs.
2. Allow only the owner direct-staging exception.
3. Run full qualification on every push, including owner direct pushes.
4. Block force pushes and deletion.
5. Require CI, batch inventory, merge-adoption-required, docs, architecture, compliance, dependencies, backend, frontend, budget, and browser journey checks.
6. Do not expose production secrets to untrusted PR code.

## Emergency Bypass

Emergency bypass is manual and incident-only.

It may be considered only when stale or unavailable QA parity evidence is the only release blocker, all other governed checks pass, the target SHA and deploy scope are clean, the owner explicitly authorizes the bypass, and bypass metadata is recorded.

Emergency bypass cannot override dirty source, failed tests, failed builds, failed architecture or compliance checks, missing high-risk merge-adoption proof, payment uncertainty, stale frontend asset parity, production runtime SHA mismatch, unknown QA target, unresolved docs overclaim, or branch-protection absence.
