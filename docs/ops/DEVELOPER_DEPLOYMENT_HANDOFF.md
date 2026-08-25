---
status: reference
authority_level: reference
owner: operations
last_reviewed: 2026-06-30
applies_to: developer_deployment_setup
topic: developer_deployment_handoff
---

# Developer Release Handoff

## Developer Scope

Developers push feature branches, open PRs into `staging`, run local validation, and prepare reviewed batch documentation. Developers do not receive production SSH credentials, signing private keys, production tokens, or access to the controller secret store.

GitHub branch protection and private deployment environments are unavailable on the current private GitHub Free plan. GitHub CI and PR state are evidence, not production authorization.

Feature branches are not disregarded by the signed-controller flow. They become production candidates when their final resolved changes are present in the exact qualified `staging` SHA and are covered by reviewed batch inventory. Production approval is for that final SHA, not for the original branch name.

## Required Reading

1. `docs/ops/RELEASE_CANDIDATE_POLICY.md` — the current, authoritative release policy.
2. `docs/architecture/adr/0030-free-tier-signed-release-authorization.md` — superseded, historical only.
3. `docs/ops/DEVELOPMENT_TO_PRODUCTION_WORKFLOW.md` — superseded, historical only.
4. `docs/ops/NO_STAGING_RELEASE_STANDARD.md` — superseded, historical only.
5. `docs/ops/QA_ISOLATION_PROFILE.md`
6. `docs/ops/PRODUCTION_CHECKLIST.md`

## Developer Workflow

1. Work on a feature branch.
2. Add or update `docs/releases/batches/<release-id>.json` from `docs/templates/REVIEWED_BATCH_MANIFEST_TEMPLATE.json`.
3. Record real test artifact paths or immutable run URLs; do not copy required tests into completed tests.
4. Complete `architecture_classification` and `documentation_closure` for every slice. Updated docs must be in the candidate diff; reviewed-current decisions require a specific reviewer rationale; cross-boundary work must update an ADR.
5. Generate and review `documentation_closure.json`; missing or failed closure is non-bypassable.
6. Keep excluded stashes and payment-channel work outside the candidate.
7. Open a PR into `staging`.
8. Address CI failures and any conflict-resolution issues on `staging`.
9. Ensure the reviewed batch manifest records the feature branch or PR provenance for the slice.
10. A direct push or merge does not become deployable merely because it reaches master.
11. Hand the exact candidate SHA, PR, reviewed manifest, documentation closure, risk notice, and evidence URLs to the owner/controller operator.

## Credential Handling

Never place these in GitHub, tracked files, workflow inputs, command lines, logs, or artifacts:

1. Owner signing private keys.
2. Production SSH private keys or passwords.
3. Controller GitHub tokens.
4. Production database, Redis, JWT, SMTP, tenant, or payment secrets.

Developer-local QA credentials may use ignored `.env.qa.local` and `.env.qa.secrets.local` files. Production credentials belong only to the controller host OS secret store.

## Owner Signing Handoff

The operator computes SHA-256 over the exact reviewed inventory and final candidate evidence. The owner signs separate annotated tags for promotion and production. Payment-sensitive releases require a third payment tag. Tags must expire and use unique nonces.

Developers must not ask GitHub Actions to sign, merge, or deploy on the owner's behalf.

## Controller Operator Handoff

The trusted operator:

1. Downloads or reconstructs evidence into a root-owned spool.
2. Verifies hashes and current GitHub PR/check state.
3. Runs the installed controller with `--dry-run`.
4. Reviews the plan and then uses `--execute`.
5. Confirms deployment ended at `deployed_pending_accuracy` and preserves the immutable external deployment record.
6. Collects post-deploy production and per-slice accuracy proof.
7. Runs the separate trusted `--finalize --execute` operation; only passing exact-SHA proof for every slice may report `completed`.

The repository scripts `scripts/deploy-remote.sh` and live `scripts/deploy-master-ci.sh` are intentionally disabled.
