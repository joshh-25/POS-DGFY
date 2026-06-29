---
status: authoritative
authority_level: authoritative
owner: release
last_reviewed: 2026-06-28
applies_to: development_to_production_release_flow
topic: development_to_production_workflow
---

# Development To Production Workflow

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
-> fail-closed per-slice production accuracy proof
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

## Regression Risk Notice

Every promotion and production candidate must produce a machine-readable and operator-readable Regression Risk Notice before signed authorization:

```bash
npm run check:regression-risk -- --inventory ".tmp/release-gates/<candidate_sha>/batch_inventory.json" --output ".tmp/release-gates/<candidate_sha>/regression_risk_notice.json" --markdown ".tmp/release-gates/<candidate_sha>/regression_risk_notice.md"
```

The notice must disclose, for every release slice, the regression risk level, affected existing behaviors, evidence reducing risk, remaining evidence gaps, and rollback or monitoring notes. Low/no-risk releases still require an explicit notice. If no specific regression risk is identified, the warning must say: `No specific regression risk identified from the reviewed diff, affected surfaces, and available evidence.`

The controller and operator must treat a missing or invalid notice as a release blocker. The notice does not automatically block deployment merely because residual risk exists; it makes the risk visible before approval.

## Candidate Evidence

GitHub candidate workflows publish short-lived evidence bundles containing the exact SHA, base SHA, PR identity, required-check conclusions and URLs, reviewed inventory hash, Regression Risk Notice, QA evidence hash, source-contract result, merge-adoption result, and payment-sensitive flag.

The controller independently verifies GitHub PR/check state and recomputes all local hashes. Candidate evidence is rejected when required evidence is absent, failed, stale, malformed, or inconsistent with current remote state.

## Isolated QA

Promotion requires QA deployed at the exact staging candidate SHA. QA must have a separate app directory, Unix identity, database and database credentials, environment/runtime marker, uploads directory, PM2 names, tenant/data marker, and disposable test data. Production database credentials and production data must be inaccessible to the QA Unix identity.

Production-as-QA is prohibited and not bypassable.

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
4. Reviewed inventory, local qualification, merge-adoption, compliance, or QA evidence failed.
5. Authorization is invalid, expired, replayed, hash-mismatched, or signed by a non-allowlisted key.
6. A payment-sensitive candidate lacks separate payment authorization.

After verification, the controller invokes a head-SHA-pinned PR merge. The merge result is a new SHA and needs separate production authorization.

The promotion controller must not reject a release because a slice originated on `feature/*`, `bugfix/*`, or another developer branch. Branch origin is provenance. The deployable object is the exact qualified staging SHA plus its reviewed inventory.

## Production Controller

Before candidate checkout, the controller verifies production and any payment authorization. It then performs local qualification in an ephemeral exact-SHA worktree without production credentials. Only after qualification succeeds may the controller use OS-protected production connection material to invoke the fixed remote deploy operation.

Production is refused when master moved, credentials are absent, QA differs from the target, inventory/evidence hashes changed, required checks failed, or any authorization was replayed/expired/invalid.

The GitHub workflow `.github/workflows/deploy-production.yml` produces a dry-run candidate bundle only. It cannot deploy.

## Production Proof And Accuracy

Deployment proof must show target agreement across remote HEAD, `.deploy-state/last_deployed_commit`, deploy summary, production contract, frontend asset parity, runtime health SHA, and public endpoints.

Every release slice must then consume actual API, UI, read-only database, or asset proof. Proof records must identify the exact target SHA, slice, proof type, command/request identity, capture time, result, and artifact hash. Missing, placeholder, stale, mutating database, or failed proof blocks release completion.

## Actions Cost Policy

1. Cancel superseded CI and staging runs.
2. Avoid running equivalent full matrices in both generic CI and staging qualification.
3. Use dependency caching and bounded job/step timeouts.
4. Keep candidate artifacts only as long as needed for controller intake.
5. Run expensive browser journey matrices weekly or manually. Release-specific browser proof belongs in the exact qualification path only when the affected slice requires it.

## Incident And Recovery

There is no unsigned emergency bypass. Incidents use fresh, explicitly scoped signed authorization and preserved controller evidence. Key compromise follows ADR 0030 revocation and rotation. A failed action never makes a nonce reusable.

## Current Limitation

GitHub cannot technically block direct master updates on the current plan. The compensating control is detection plus controller refusal. A user with production root access can bypass software controls and remains an audited operational trust anchor.
