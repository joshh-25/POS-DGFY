# Signed-Controller Release Standard

## Purpose

Enforce exact-SHA release safety when GitHub branch protection, rulesets, private environment secrets, and required deployment reviewers are unavailable.

The external controller contract in ADR 0030 supersedes local production triggering. `scripts/deploy-remote.sh` and live `scripts/deploy-master-ci.sh` operation are disabled. GitHub produces candidate evidence only.

This standard does not require every change to originate on `staging`. Developer branches are valid when they are merged into `staging`, the final staging SHA is qualified, and reviewed inventory records the source PR or branch provenance. The controller authorizes that final SHA.

## Non-Bypassable Gates

The external controller refuses promotion or production unless all applicable evidence agrees on the exact target SHA:

1. A human-reviewed version 2 batch inventory maps every changed file exactly once and contains evidence-backed completed tests.
1a. A valid Regression Risk Notice exists for every release slice and is reviewed before signed authorization.
1b. A passing `sku-documentation-closure/v1` artifact proves tracked document paths, actual updated-file coverage, reviewed no-change decisions, and ADR closure for every cross-boundary slice. Documentation closure is non-bypassable.
2. Every release slice declares classified provenance. `developer_pr` and `owner_direct_staging` are normal staging inputs; direct-master work must be reconciled through `staging` before production authorization.
3. The owner supplied a valid, unexpired, allowlisted GPG-signed annotated authorization tag.
4. Promotion and production use separate authorizations and nonces.
5. Payment-sensitive candidates include a third, separate payment authorization.
6. The nonce does not exist in the root-owned controller ledger.
7. Current `origin/staging` or `origin/master` still equals the authorized SHA.
8. Live PR identity, head/base refs, merge SHA, and required checks match signed evidence.
9. Controller-local qualification passes without access to production secrets.
10. QA is isolated and its deploy summary proves the exact SHA plus Unix user, app directory, database, credential identity, runtime/data markers, uploads, PM2 names, and disposable-data status.
11. Production connection material exists only in the controller OS secret store.
12. Post-deploy remote HEAD, deploy state, summary, contract, runtime SHA, endpoints, and assets agree before the ledger enters `deployed_pending_accuracy`.
13. Each slice has hash-verified API, UI, read-only database, or asset proof captured after deployment.
14. A separate trusted finalization operation recollects exact-SHA production proof before transitioning to `completed`.
15. Immutable deployment and finalization records are written outside Git under the root-owned configured release-record directory.

There is no unsigned emergency bypass. Failed actions require corrected evidence and a fresh signed tag with a new nonce.

The signed emergency QA lane is allowed only for genuine isolated-QA unavailability. It requires a hash-bound `sku-emergency-qa-authorization/v1` report, root-owned `emergency_qa_bypass.enabled=true`, exact-SHA owner approval, no payment-sensitive files, no migrations, all non-QA gates passing, rollback readiness, planned read-only production smoke, and mandatory deployed-change accuracy finalization. Production-as-QA remains prohibited: the report records unavailable QA and does not authorize a QA deploy to production.

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

Documentation closure:

```bash
npm run check:documentation-closure -- --inventory <inventory.json> --base <base> --head <sha> --output <documentation_closure.json> --markdown <documentation_closure.md>
```

Regression Risk Notice:

```bash
npm run check:regression-risk -- --inventory <inventory.json> --output <regression_risk_notice.json> --markdown <regression_risk_notice.md>
```

QA proof:

```bash
RELEASE_TARGET_SHA=<sha> npm run check:qa-target-proof -- --target-sha <sha> --summary <qa-summary> --report <qa-proof.json>
```

Production accuracy proof and separate finalization:

```bash
npm run review:deployed-change-accuracy -- --inventory <inventory.json> --deploy-summary <summary.txt> --production-contract <contract.json> --proof-bundle <proof-bundle.json> --output <accuracy.json> --markdown <accuracy.md>
```

Successful deploy execution is never release completion. Missing or failed finalization retains `deployed_pending_accuracy`; there is no documentation or accuracy bypass.

## GitHub Role

GitHub may run CI, upload five-day evidence artifacts, create the promotion PR, and preserve `regression_risk_notice.*` with candidate evidence. `.github/workflows/deploy-production.yml` is a candidate-bundle workflow and contains no production secrets or deploy command. `ENABLE_AUTO_PRODUCTION_DEPLOY` remains `0`.

## References

1. `docs/architecture/adr/0030-free-tier-signed-release-authorization.md`
2. `docs/ops/DEVELOPMENT_TO_PRODUCTION_WORKFLOW.md`
3. `docs/ops/QA_ISOLATION_PROFILE.md`
4. `docs/ops/PRODUCTION_CHECKLIST.md`
