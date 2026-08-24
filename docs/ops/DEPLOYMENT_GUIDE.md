# Deployment Guide - SKU Inventory Manager

## Purpose

Operational guide for the production deploy operation after ADR 0030 authorization.

GitHub and developer machines do not deploy production. The root-owned external controller is the only supported caller. `scripts/deploy-remote.sh` and live `scripts/deploy-master-ci.sh` are disabled.

## Trust Boundary

1. Owner GPG-signed annotated tags authorize exact SHAs.
2. Installed controller code verifies signatures, hashes, expiry, nonces, PR/check evidence, Regression Risk Notice, QA, and current remote refs before candidate checkout.
3. Candidate qualification receives no production or signing secrets.
4. Controller code invokes SSH using its OS-protected key and a fixed remote command.
5. The production server runs `scripts/deploy.sh --branch master --expect-commit <sha>` only after controller authorization.

## Production Host Prerequisites

1. Clean `/var/www/skupervisor` checkout with `origin` configured.
2. Required `backend/.env` values and production-only permissions.
3. PM2 ecosystem configured through root `ecosystem.config.cjs`.
4. Database backup destination, deploy logs, and `.deploy-state` writable by the deployment identity.
5. Controller SSH identity restricted to the production operation where practical.

## Controller Dry Run

Follow `release-controller/README.md`. Dry run must report `authorized_pre_checkout` for the exact SHA and evidence hashes. Any moved branch, failed check, stale QA proof, expired/replayed signature, missing credential, or payment authorization failure requires new evidence or a new signed tag.

Before signed authorization, generate and review the Regression Risk Notice from the strict reviewed inventory:

```bash
npm run check:regression-risk -- --inventory ".tmp/release-gates/<target_sha>/batch_inventory.json" --output ".tmp/release-gates/<target_sha>/regression_risk_notice.json" --markdown ".tmp/release-gates/<target_sha>/regression_risk_notice.md"
```

## Server Deploy Operation

The controller executes the equivalent fixed remote operation:

```bash
set -e
cd /var/www/skupervisor
git fetch origin master
test "$(git rev-parse origin/master)" = "<authorized_sha>"
bash scripts/deploy.sh --branch master --expect-commit <authorized_sha>
```

Do not run this manually for routine releases. Production/root operators remain an explicit privileged trust anchor and every manual intervention is an incident or recovery action.

The deploy invocation does not complete the release. After SSH succeeds, the controller recollects remote HEAD, deploy marker, newest deploy summary, production contract, frontend asset parity, and live runtime SHA, transitions the nonce to `deployed_pending_accuracy`, and writes immutable external deployment records.

## Deploy Pipeline

`scripts/deploy.sh` performs deterministic dependency installation, governed docs and architecture checks, frontend builds, migration checks, backup, schema/index audits, tenant sync reporting, PM2 reload, health checks, public endpoint checks, frontend asset parity, deploy summary creation, and production contract proof.

## Required Post-Deploy Evidence

1. Remote HEAD and `.deploy-state/last_deployed_commit` equal the target.
2. Latest summary `deployed_head`, `remote_head`, and `expected_commit` equal the target.
3. Production contract is successful and health runtime SHA equals the target.
4. IMS, POS, Storefront, tenant-store, and asset parity pass.
5. Every inventory slice has hash-verified API, UI, read-only database, or asset proof captured after deployment.
6. `review:deployed-change-accuracy` exits zero.
7. The separate controller `--finalize --execute` operation confirms production still runs the exact target and transitions the ledger from `deployed_pending_accuracy` to `completed`.
8. `/var/lib/skupervisor-release-controller/releases/<sha>/release_record.{json,md}` and `accuracy_finalization.{json,md}` exist with root-only permissions.

## External Release Records

The controller configuration must set:

```json
"release_records_dir": "/var/lib/skupervisor-release-controller/releases"
```

Deployment records include target SHA/branch, inventory and evidence hashes, signed tags, signer fingerprint, nonce and ledger state, reviewed slices, documentation closure, Regression Risk Notice, baseline proof, pending per-slice accuracy state, residual risks, timestamps, and artifact hashes. Finalization records add the verified per-slice completed accuracy state. These files are outside Git and must not mutate the deployed checkout.

Repository documentation may later link to or summarize an external record, but that follow-up commit describes an already-deployed SHA and cannot claim its own deployment as self-proof.

## Recovery

If deployment fails:

1. Preserve controller log, nonce ledger entry, authorization tags, candidate bundle, server deploy log, backup path, and partial production proof.
2. Do not remove or reset the consumed nonce.
3. Restore or revert using a newly qualified SHA.
4. Produce corrected evidence and fresh signed production/payment tags with new nonces.
5. Re-run controller dry run before execution.

If a server deploy lock is stale, first prove no deploy process is active. Clearing a lock is a privileged recovery action and must be recorded.

## Secret Handling

Production SSH keys, database credentials, tokens, and signing private keys must not appear in GitHub, repository files, workflow inputs, commands, logs, or evidence artifacts. Store them only in the controller/production OS-protected secret stores.

This document describes the release-controller/PM2 model that ADR 0030 records as never built for this repository (see that ADR's own superseded notice and `docs/ops/RELEASE_CANDIDATE_POLICY.md`). The actual current production secret handling is a single plaintext `/opt/dgfy-platform/.env`, consumed by `docker compose` per `.github/workflows/publish-platform.yml`. A planned replacement — SOPS-encrypted secrets, scoped per service, config left in a smaller plaintext `.env` — is recorded in ADR 0060 and `docs/ops/SOPS_SECRETS_CUTOVER_RUNBOOK.md`. Not yet executed; consult the runbook, not this section, for the actual current-and-planned secret-handling mechanics.

## References

1. `docs/architecture/adr/0030-free-tier-signed-release-authorization.md`
2. `docs/ops/DEVELOPMENT_TO_PRODUCTION_WORKFLOW.md`
3. `docs/ops/NO_STAGING_RELEASE_STANDARD.md`
4. `docs/ops/QA_ISOLATION_PROFILE.md`
5. `docs/ops/PRODUCTION_CHECKLIST.md`
