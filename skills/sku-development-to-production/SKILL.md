---
name: sku-development-to-production
description: Use for SKU Inventory Manager signed staging promotion, candidate evidence, external production authorization, and deployed-change accuracy review.
---

# SKU Development To Production

Use only inside `C:\xampp\htdocs\SKU-Inventory-Manager` or a clean worktree.

## Mandatory Reading

1. `docs/START_HERE.md`
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
3. `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
4. `docs/architecture/adr/0030-free-tier-signed-release-authorization.md`
5. `docs/architecture/adr/0027-paymongo-commerce-qrph-platform-split-settlement.md`
6. `docs/ops/DEVELOPMENT_TO_PRODUCTION_WORKFLOW.md`
7. `docs/ops/NO_STAGING_RELEASE_STANDARD.md`
8. `docs/ops/QA_ISOLATION_PROFILE.md`
9. `docs/testing/release-go-no-go-checklist.md`

## Trust Model

The private GitHub Free repository has no enforceable branch protection, rulesets, private environment secrets, or required deployment reviewers. GitHub is a CI, PR, and candidate-evidence surface only.

Never place production credentials or signing private keys in GitHub. Never use GitHub auto-merge or a GitHub live deploy. `ENABLE_AUTO_PRODUCTION_DEPLOY` remains `0`.

The root-owned external release controller is the only supported promotion and production authority.

## Inspection

Inspect current branch, remote parity, changed files, stash list, candidate SHA, PR evidence, reviewed batch manifest, and payment-sensitive paths. Preserve the PayMongo stash by message:

```text
pre-prod-deploy-preserve-paymongo-commerce-work-2026-06-08
```

## Batch Inventory

Draft generation is not approval:

```bash
npm run check:batch-inventory -- --base <base> --head <sha> --write --inventory <draft.json> --markdown <draft.md>
```

Strict promotion requires one tracked human-reviewed manifest:

```bash
npm run check:batch-inventory -- --base <base> --head <sha> --reviewed-manifest docs/releases/batches/<release>.json --write --require-ship --inventory <inventory.json> --markdown <inventory.md>
npm run validate:batch-inventory -- --inventory <inventory.json> --base <base> --head <sha> --require-ship
```

Reject placeholders, unknown attribution, silent files, and completed-test claims without evidence.

## Signed Promotion

1. Qualify exact staging SHA.
2. Prove isolated exact-SHA QA.
3. Let GitHub create or update the `staging -> master` PR only.
4. Hash exact reviewed inventory and candidate evidence.
5. Require owner GPG-signed `phase=promotion` tag with expiry and fresh nonce.
6. Require separate payment tag when payment-sensitive.
7. Run installed controller dry-run, then execute the head-SHA-pinned merge.

## Signed Production

1. Audit the resulting master merge and exact SHA.
2. Run exact-master evidence and controller-local qualification.
3. Require a new `phase=production` tag for the master SHA.
4. Require a master-SHA payment tag when payment-sensitive.
5. Run controller dry-run, confirm master has not moved, then execute.

`scripts/deploy-remote.sh` and live `scripts/deploy-master-ci.sh` are disabled.

## Completion

Prove production SHA, deploy state, summary, production contract, health, endpoints, and assets. Then require actual hash-verified API, UI, read-only database, or asset proof for every release slice. Missing or placeholder accuracy evidence fails closed.

There is no unsigned emergency bypass. Failed attempts require corrected evidence and fresh signed tags/nonces.
