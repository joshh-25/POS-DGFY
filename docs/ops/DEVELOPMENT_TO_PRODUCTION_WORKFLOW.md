---
status: deprecated
superseded_by: RELEASE_CANDIDATE_POLICY.md
authority_level: historical
owner: release
last_reviewed: 2026-07-30
applies_to: development_to_production_release_flow
topic: development_to_production_workflow
---

# Development To Production Workflow

**Superseded 2026-07-30 — see `docs/ops/RELEASE_CANDIDATE_POLICY.md`.** This
document describes a `master` branch and a root-owned external release
controller. Neither exists in this repository (`Sieitz/dgfy-platform` uses
`main`, and no controller was ever installed); it also references
`scripts/promote-staging-to-master.js` and workflows
(`staging-qualification.yml`, `exact-master-sha-qualification.yml`,
`promote-staging-to-master.yml`) that were failing or permanently skipped on
every recent run before being archived to `.github/workflows-archive/`. Kept
here as historical context for the reviewed-batch-inventory and
regression-risk tooling this repo still has scripts for but does not
currently run as a live gate. Do not treat anything below as the current
policy.

## Purpose

This is the authoritative workflow for moving SKU Inventory Manager changes to production on a private GitHub Free repository.

GitHub branch protection, rulesets, private-environment secrets, and required deployment reviewers are unavailable. GitHub therefore provides CI, pull-request creation, and candidate evidence only. Production enforcement occurs at the external signed-authorization boundary defined by ADR 0030.

```text
feature PR -> staging CI -> reviewed batch document -> isolated QA
-> GitHub creates staging-to-master PR and candidate bundle
-> owner signs promotion authorization
-> external controller verifies and merges exact staging SHA
-> exact master evidence and local controller qualification
-> owner signs production authorization
-> external controller deploys exact master SHA
-> deployed_pending_accuracy + immutable external deployment record
-> separate trusted per-slice production accuracy finalization
-> completed + immutable external finalization record
```

## Authoritative Inputs

1. `docs/START_HERE.md`
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
3. `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
4. `docs/architecture/adr/0030-free-tier-signed-release-authorization.md`
5. `docs/architecture/adr/0027-paymongo-commerce-qrph-platform-split-settlement.md` for payment-sensitive releases
6. `docs/ops/NO_STAGING_RELEASE_STANDARD.md`
7. `docs/ops/DEPLOYMENT_GUIDE.md`
8. `docs/testing/release-go-no-go-checklist.md`

## Trust Boundaries

1. Candidate code and GitHub Actions are untrusted with respect to production authorization.
2. GitHub never stores production SSH credentials, signing private keys, production tokens, or controller secret-store material.
3. The root-owned, version-pinned external controller verifies signatures and evidence before candidate checkout or execution.
4. Only the external controller may merge a promotion PR or reach production.
5. `ENABLE_AUTO_PRODUCTION_DEPLOY=0` is permanent while this contract is active.

## Branch And PR Model

1. Developers use feature branches and PRs into `staging`.
2. Owner direct pushes to `staging` still require complete staging qualification and reviewed batch documentation.
3. GitHub automation may create or update `staging -> master` PRs. It must never merge them.
4. `master` is production-candidate source only; being on master does not make a commit deployable.
5. The controller evaluates the final resolved SHA, not the original source branch names. Feature branches, developer PRs, and conflict-resolution commits are eligible for production when they are included in the exact qualified `origin/staging` SHA and mapped in reviewed batch inventory.
6. Every master update is audited. Direct pushes and merges without governed promotion evidence are reported and remain undeployable through the controller until the work is reconciled through `staging` and promoted through the governed path.
7. Production uses the exact current `origin/master` SHA. Any movement invalidates the authorization attempt.

## Merged Source Branch Cleanup

Ordinary short-lived source branches may be cleaned after their PR is merged into `staging` or `master`. This is repository hygiene, not production authorization, and it must not be used as proof that the change is production-live.

The cleanup workflow is `.github/workflows/cleanup-merged-branches.yml`. It runs only from the trusted base checkout and uses `scripts/review-merged-branch-cleanup.js` plus `.github/branch-cleanup-policy.json`.

The cleanup decision must pass all of these checks before a remote branch is deleted:

1. The PR is closed and merged.
2. The PR base is `staging` or `master`.
3. The PR head branch is in the same repository, not a fork.
4. The head branch is not an exact protected branch and does not use a protected prefix.
5. The head branch uses an eligible short-lived prefix such as `codex/`, `feature/`, `fix/`, `bugfix/`, `hotfix/`, `docs/`, `chore/`, or `test/`.
6. The PR does not carry a keep label such as `branch-cleanup:keep`.
7. No open PR still uses the branch as either head or base.
8. The current remote branch SHA still equals the PR head SHA.
9. The PR merge commit is reachable from the current base branch tip.
10. Deletion uses a SHA lease, so the push refuses to delete if the remote branch moved after review.

Protected long-lived and evidence-preserving branches must not be removed by this workflow, including `master`, `staging`, `development`, `pr-testing`, Storefront pilot branches, release/deployment/production/safety/evidence branches, and PayMongo/payment branches.

Do not enable GitHub's repository-wide automatic head-branch deletion while branch protection and rulesets are unavailable. A blanket setting cannot distinguish ordinary feature PRs from `staging -> master` promotion PRs where `staging` is the head branch.

Local worktree cleanup remains separate from remote branch cleanup. A remote branch deletion does not prove a local worktree, stash, evidence directory, or rollback dependency is disposable.

## Reviewed Batch Inventory

Draft inventory generation may occur during development. Before promotion authorization, a human-reviewed batch document must provide non-placeholder summaries, exact file coverage, owner and PR attribution, source branch or owner-direct-staging attribution for each slice, test evidence references, rollback notes, required documentation, payment sensitivity, and production proof requirements. The source branch may be a developer feature branch; it does not need to be named `staging` when the slice is present in the final staging candidate.

Every generated and reviewed inventory slice must also include a Regression Risk Notice with `regression_risk_level`, `regression_warning_required`, `regression_warning_summary`, `potentially_affected_existing_behaviors`, `evidence_covering_regression_risk`, `evidence_gaps`, and `rollback_or_monitoring_notes`.

Strict validation rejects:

1. `unknown`, `not provided`, generated summaries, or placeholder values.
2. Changed files not mapped to exactly one slice.
3. `completed_tests` without corresponding evidence records.
4. Missing owner, source branch, source PR, reviewer, or review timestamp.
5. Missing or draft batch documentation.
6. Payment-sensitive files without separate signed payment authorization.
7. Unclassified provenance such as a direct-master change pretending to be ordinary developer PR work.
8. Missing or invalid regression-risk disclosure fields.

The controller hashes the exact reviewed inventory bytes with SHA-256. The owner authorization tag binds that hash.

Each reviewed slice must also declare `architecture_classification` and a `documentation_closure` object. Closure is either `updated` or `no_change_required`; it must identify a real reviewer, review timestamp, specific rationale, governed document paths, action, and evidence. Updated documents must be present in the exact candidate diff. Reviewed-current documents must exist and be tracked. Cross-boundary slices must include an updated ADR. The generated `documentation_closure.json` report is non-bypassable and its SHA-256 is bound into `sku-release-evidence/v2`.

## Regression Risk Notice

Every promotion and production candidate must produce a machine-readable and operator-readable Regression Risk Notice before signed authorization:

```bash
npm run check:regression-risk -- --inventory ".tmp/release-gates/<candidate_sha>/batch_inventory.json" --output ".tmp/release-gates/<candidate_sha>/regression_risk_notice.json" --markdown ".tmp/release-gates/<candidate_sha>/regression_risk_notice.md"
```

The notice must disclose, for every release slice, the regression risk level, affected existing behaviors, evidence reducing risk, remaining evidence gaps, and rollback or monitoring notes. Low/no-risk releases still require an explicit notice. If no specific regression risk is identified, the warning must say: `No specific regression risk identified from the reviewed diff, affected surfaces, and available evidence.`

The controller and operator must treat a missing or invalid notice as a release blocker. The notice does not automatically block deployment merely because residual risk exists; it makes the risk visible before approval.

## Candidate Evidence

GitHub candidate workflows publish short-lived evidence bundles containing the exact SHA, base SHA, PR identity, required-check conclusions and URLs, reviewed inventory hash, documentation-closure status and hash, Regression Risk Notice status and hash, QA evidence hash, source-contract result, lightweight merge hygiene result, merge-adoption result, and payment-sensitive flag.

The controller independently verifies GitHub PR/check state and recomputes all local hashes. Candidate evidence is rejected when required evidence is absent, failed, stale, malformed, or inconsistent with current remote state.

## Isolated QA

Promotion requires QA deployed at the exact staging candidate SHA. QA must have a separate app directory, Unix identity, database and database credentials, environment/runtime marker, uploads directory, PM2 names, tenant/data marker, and disposable test data. Production database credentials and production data must be inaccessible to the QA Unix identity.

Production-as-QA is prohibited and not bypassable. When distinct isolated QA is genuinely unavailable, the signed emergency QA lane may record QA as unavailable; it must never run QA promotion or mutation against production.

## Signed Authorization

Use standard GPG-signed annotated tags following ADR 0030. Required phases are:

1. `promotion`: authorizes merging the exact staging candidate after PR, checks, inventory, and QA proof pass.
2. `production`: authorizes deploying the exact resulting master SHA after exact-master evidence and controller-local qualification pass.
3. `payment`: additionally required for any payment-sensitive release.

Each authorization binds repository, phase, target SHA, expiration, one-time nonce, inventory SHA-256, evidence SHA-256, payment-sensitive flag, and PR number. The controller verifies the tag target and full allowlisted signer fingerprint before checkout and records nonce consumption in its root-owned ledger.

## Promotion Controller

The external controller must refuse promotion when:

1. `origin/staging` moved from the signed target.
2. The PR head/base or current master base differs from evidence.
3. Required checks are absent or not successful.
4. Reviewed inventory, local qualification, lightweight merge hygiene, merge-adoption, compliance, or QA evidence failed.
5. Authorization is invalid, expired, replayed, hash-mismatched, or signed by a non-allowlisted key.
6. A payment-sensitive candidate lacks separate payment authorization.

After verification, the controller invokes a head-SHA-pinned PR merge. The merge result is a new SHA and needs separate production authorization.

The promotion controller must not reject a release because a slice originated on `feature/*`, `bugfix/*`, or another developer branch. Branch origin is provenance. The deployable object is the exact qualified staging SHA plus its reviewed inventory.

## Production Controller

Before candidate checkout, the controller verifies production and any payment authorization. It then performs local qualification in an ephemeral exact-SHA worktree without production credentials. Only after qualification succeeds may the controller use OS-protected production connection material to invoke the fixed remote deploy operation.

Production is refused when master moved, credentials are absent, QA differs from the target, inventory/evidence/documentation hashes changed, documentation closure failed, lightweight merge hygiene failed, required checks failed, or any authorization was replayed/expired/invalid.

The GitHub workflow `.github/workflows/deploy-production.yml` produces a dry-run candidate bundle only. It cannot deploy.

## Production Proof And Accuracy

Deployment proof must show target agreement across remote HEAD, `.deploy-state/last_deployed_commit`, deploy summary, production contract, frontend asset parity, runtime health SHA, and public endpoints. Successful deployment transitions the nonce ledger only to `deployed_pending_accuracy` and creates immutable `release_record.json` plus `release_record.md` under the root-owned external `release_records_dir`.

Every release slice must then consume actual API, UI, read-only database, or asset proof. Proof records must identify the exact target SHA, slice, proof type, command/request identity, capture time, result, and artifact hash. A separate trusted finalization invocation recollects production proof and rejects missing, placeholder, stale, mutating database, wrong-SHA, hash-mismatched, or failed proof. Only a passing proof for every slice transitions the ledger to `completed` and creates immutable `accuracy_finalization.json` plus `.md`.

## Release Truth And Documentation

1. Production runtime truth comes from live runtime SHA plus deploy markers and contract evidence.
2. Source-current documentation describes repository intent and must not be presented as production-live by itself.
3. External immutable release records preserve what was deployed, its signed authorization, documentation closure, risk notice, baseline proof, lifecycle state, and final per-slice accuracy.
4. Follow-up tracked documentation may summarize an external record for operator discovery, but its later commit is not proof of its own deployment.
5. `deployed_pending_accuracy` means code reached production but the release is not complete.
6. `completed` means current exact-SHA production proof and every required per-slice accuracy proof passed trusted finalization.

## Actions Cost Policy

### Billing-Unavailable Qualification Lane

GitHub remains the PR and review record when Actions cannot allocate a runner. A failed check is eligible for this lane only when `npm run collect:github-actions-unavailability` proves the exact target SHA, GitHub Actions ownership, zero runner assignment, zero executed steps, and the explicit billing/spending-limit annotation for every substituted check.

For a feature PR into `staging`:

1. Keep the PR open and pin all review to the current head SHA.
2. Collect the machine-readable billing-unavailability report from GitHub APIs.
3. Run the PR's complete required qualification in a clean exact-head worktree. A failing command blocks merge.
4. Require explicit human approval and resolve actionable review findings.
5. Merge with head-SHA matching. Any movement of the PR head or `staging` base invalidates the qualification and requires a fresh run.
6. Treat the resulting staging merge SHA as unqualified for promotion until complete staging qualification and isolated QA pass for that exact SHA.

For `staging -> master` promotion or exact-master production qualification, pass the report to `build:release-candidate-evidence` with `--github-actions-unavailability`. The external controller accepts it only when root-owned configuration enables `github_actions_billing_fallback`, the report hash is covered by the signed evidence, live GitHub API data still proves the billing denial, and controller-local exact-SHA qualification passes.

This lane is not an emergency bypass. It substitutes execution location, not acceptance criteria. Missing checks, jobs that started, failed tests, missing isolated QA, unresolved review, stale evidence, payment-sensitive authorization gaps, or branch drift remain hard blockers.

Example collection:

```bash
npm run collect:github-actions-unavailability -- \
  --repository BBLabs-Albert/SKU-Inventory-Manager \
  --target-sha <exact-sha> \
  --required-check staging-qualification \
  --output .tmp/release-gates/<exact-sha>/github_actions_unavailability.json
```

1. Cancel superseded CI and staging runs.
2. Avoid running equivalent full matrices in both generic CI and staging qualification.
3. Use dependency caching and bounded job/step timeouts.
4. Keep candidate artifacts only as long as needed for controller intake.
5. Run expensive browser journey matrices weekly or manually. Release-specific browser proof belongs in the exact qualification path only when the affected slice requires it.

## Incident And Recovery

There is no unsigned emergency bypass. The supported emergency path is `reason_code=isolated_qa_unavailable` in a hash-bound `sku-emergency-qa-authorization/v1` report, enabled by root-owned controller configuration and approved through separate fresh signed promotion and production tags. It is limited to non-payment, no-migration releases with passing non-QA gates, trusted local qualification, rollback readiness, planned read-only production smoke, and mandatory accuracy finalization. Key compromise follows ADR 0030 revocation and rotation. A failed action never makes a nonce reusable.

## Current Limitation

GitHub cannot technically block direct master updates on the current plan. The compensating control is detection plus controller refusal. A user with production root access can bypass software controls and remains an audited operational trust anchor.
