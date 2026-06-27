---
name: sku-development-to-production
description: Use for SKU Inventory Manager development-to-production promotion work, staging qualification, batch inventory, staging-to-master PR automation, exact-SHA production deployment, and deployed-change accuracy review.
---

# SKU Development To Production

Use this skill only inside `C:\xampp\htdocs\SKU-Inventory-Manager` or its clean worktrees.

## Mandatory Reading

Read these before planning or implementing release workflow work:

1. `docs/START_HERE.md`
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
3. `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
4. `docs/ops/DEVELOPMENT_TO_PRODUCTION_WORKFLOW.md`
5. `docs/ops/NO_STAGING_RELEASE_STANDARD.md`
6. `docs/ops/DEPLOYMENT_GUIDE.md`
7. `docs/ops/WORKSPACE_CLEANUP_AND_BRANCH_POLICY.md`
8. `docs/testing/release-go-no-go-checklist.md`

## First Inspection

Inspect and report:

1. `git status --short --branch`
2. `git stash list`
3. `git rev-parse HEAD`
4. `git rev-parse origin/staging`
5. `git rev-parse origin/master`
6. changed file groups by feature/domain
7. candidate SHA and whether it is local-only, `staging`, or `master`

Never treat local uncommitted files or stashes as deployable. Production pulls pushed `origin/master` only.

## Branch Model

Use the governed path:

```text
feature branch -> PR to staging -> exact staging SHA qualification -> distinct QA proof -> staging to master PR -> exact master SHA qualification -> exact origin/master production deploy -> deployed-change accuracy review
```

Developers open PRs into `staging`. Owner direct-staging work is the only exception, and it still requires complete staging qualification.

## Batch Inventory

Before sliced commits, PR promotion, or deployment, inspect all implementations in the candidate and produce batch-level inventory:

```bash
npm run check:batch-inventory -- --base origin/master --head <candidate_sha> --write --require-ship --inventory ".tmp/release-gates/<candidate_sha>/batch_inventory.json" --markdown ".tmp/release-gates/<candidate_sha>/batch_inventory.md"
```

Each batch must identify purpose, included/excluded files, risk, affected surfaces, tests, docs, ADR/compliance need, commit boundary, rollback notes, production proof, independence, and verdict.

Do not allow unrelated implementations to ride along silently.

## Excluded Work

Preserve excluded work, especially the PayMongo stash named:

```text
pre-prod-deploy-preserve-paymongo-commerce-work-2026-06-08
```

Search by stash message, not by `stash@{n}`.

Payment-sensitive candidates stop automatic promotion unless explicit payment-release approval exists. Do not infer PayMongo live readiness from source state.

## Promotion And Deployment Rules

1. Enforce staging qualification before promotion.
2. Treat `staging -> master` PR creation/update as a first-class release phase.
3. Include batch inventory and evidence in the promotion PR body.
4. Requalify the resulting `master` SHA after merge.
5. Deploy only exact `origin/master` SHA.
6. Use `RELEASE_TARGET_SHA=<origin_master_sha> npm run deploy:prod:ci` only after branch protection and distinct QA proof are configured.
7. Keep the local operator path unchanged: `scripts/deploy-remote.sh --yes`.

## Production Proof And Accuracy

Hand production verification to the existing production-deployer contract. Prove remote `HEAD`, `.deploy-state/last_deployed_commit`, deploy summary, production contract, frontend asset parity, `/api/v1/health` runtime SHA, endpoint health, and feature-specific behavior.

After SHA proof, review whether production accurately reflects each shipped batch. Do not mark complete when the state is only source-current, partially reflected, docs-overclaimed, or deployed but behavior not proven.

## Emergency Bypass

Never use emergency bypass automatically.

Emergency bypass is manual, incident-only, and cannot override dirty source, failed checks, missing merge-adoption proof, payment uncertainty, stale asset parity, runtime SHA mismatch, unknown QA target, missing batch inventory, or docs overclaim.

## CI Independence

This skill is guidance for agents. CI/CD must depend on tracked scripts, workflows, and docs, not on the skill being installed locally.
