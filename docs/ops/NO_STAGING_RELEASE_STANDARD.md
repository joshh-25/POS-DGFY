# Signed-Controller Release Standard

## Purpose

Enforce exact-SHA release safety when GitHub branch protection, rulesets, private environment secrets, and required deployment reviewers are unavailable.

The external controller contract in ADR 0030 supersedes local production triggering. `scripts/deploy-remote.sh` and live `scripts/deploy-master-ci.sh` operation are disabled. GitHub produces candidate evidence only.

## Non-Bypassable Gates

The external controller refuses promotion or production unless all applicable evidence agrees on the exact target SHA:

1. A human-reviewed version 2 batch inventory maps every changed file exactly once and contains evidence-backed completed tests.
2. The owner supplied a valid, unexpired, allowlisted GPG-signed annotated authorization tag.
3. Promotion and production use separate authorizations and nonces.
4. Payment-sensitive candidates include a third, separate payment authorization.
5. The nonce does not exist in the root-owned controller ledger.
6. Current `origin/staging` or `origin/master` still equals the authorized SHA.
7. Live PR identity, head/base refs, merge SHA, and required checks match signed evidence.
8. Controller-local qualification passes without access to production secrets.
9. QA is isolated and its deploy summary proves the exact SHA plus Unix user, app directory, database, credential identity, runtime/data markers, uploads, PM2 names, and disposable-data status.
10. Production connection material exists only in the controller OS secret store.
11. Post-deploy remote HEAD, deploy state, summary, contract, runtime SHA, endpoints, and assets agree.
12. Each slice has hash-verified API, UI, read-only database, or asset proof.

There is no unsigned emergency bypass. Failed actions require corrected evidence and a fresh signed tag with a new nonce.

## QA Contract

Use `docs/ops/QA_ISOLATION_PROFILE.md`. Production-as-QA is prohibited. The QA Unix identity must be unable to read production credentials, data, uploads, backups, and controller state.

## Evidence Commands

Draft inventory:

```bash
npm run check:batch-inventory -- --base <base> --head <sha> --write --inventory <draft.json> --markdown <draft.md>
```

Strict reviewed inventory:

```bash
npm run check:batch-inventory -- --base <base> --head <sha> --reviewed-manifest docs/releases/batches/<release>.json --write --require-ship --inventory <inventory.json> --markdown <inventory.md>
npm run validate:batch-inventory -- --inventory <inventory.json> --base <base> --head <sha> --require-ship
```

QA proof:

```bash
RELEASE_TARGET_SHA=<sha> npm run check:qa-target-proof -- --target-sha <sha> --summary <qa-summary> --report <qa-proof.json>
```

Production accuracy proof:

```bash
npm run review:deployed-change-accuracy -- --inventory <inventory.json> --deploy-summary <summary.txt> --production-contract <contract.json> --proof-bundle <proof-bundle.json> --output <accuracy.json> --markdown <accuracy.md>
```

## GitHub Role

GitHub may run CI, upload five-day evidence artifacts, and create the promotion PR. `.github/workflows/deploy-production.yml` is a candidate-bundle workflow and contains no production secrets or deploy command. `ENABLE_AUTO_PRODUCTION_DEPLOY` remains `0`.

## References

1. `docs/architecture/adr/0030-free-tier-signed-release-authorization.md`
2. `docs/ops/DEVELOPMENT_TO_PRODUCTION_WORKFLOW.md`
3. `docs/ops/QA_ISOLATION_PROFILE.md`
4. `docs/ops/PRODUCTION_CHECKLIST.md`
