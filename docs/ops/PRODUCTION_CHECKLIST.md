# Production Release Controller Checklist

Use this checklist for every production release under ADR 0030.

## Controller Installation

- [ ] Controller release checksum was verified out of band.
- [ ] Installed version is root-owned under `/opt/skupervisor-release-controller/releases/<version>`.
- [ ] `/opt/skupervisor-release-controller/current` points to the reviewed version.
- [ ] Config, GNUPG home, secret directory, mirror, worktrees, and nonce ledger are root-owned with restrictive permissions.
- [ ] External release-record directory is root-owned `0700`, and record files are created `0600` outside the deployed checkout.
- [ ] Bootstrap evidence records exact controller source SHA, package checksum, installer version, tests, owner approval, and full signer fingerprint.
- [ ] Full owner signing-key fingerprints are allowlisted.
- [ ] Production SSH key exists only in the controller OS secret store.
- [ ] GitHub/controller token exists only in the controller OS secret store.
- [ ] QA identity cannot access production data or controller state.

## Promotion Authorization

- [ ] `origin/staging` equals the intended exact candidate SHA.
- [ ] Developer feature-branch and conflict-resolution work is present in that final staging SHA; no slice is excluded merely because its source branch is not `staging`.
- [ ] Staging qualification passed and required checks have immutable URLs.
- [ ] Exactly one reviewed batch manifest exists in the candidate diff.
- [ ] Strict version 2 inventory validation passes with exact file coverage.
- [ ] Every slice has passing non-placeholder documentation closure; updated paths are in the candidate diff and cross-boundary slices update an ADR.
- [ ] `documentation_closure.json` passes and its hash is bound into `sku-release-evidence/v2`.
- [ ] Regression Risk Notice is generated and reviewed before signed promotion authorization:
  ```bash
  npm run check:regression-risk -- --inventory ".tmp/release-gates/<target_sha>/batch_inventory.json" --output ".tmp/release-gates/<target_sha>/regression_risk_notice.json" --markdown ".tmp/release-gates/<target_sha>/regression_risk_notice.md"
  ```
- [ ] Every slice has classified provenance: `developer_pr`, `owner_direct_staging`, or `controller_promotion`.
- [ ] QA summary and isolation proof pass for the exact staging SHA.
- [ ] Promotion PR is `staging -> master` and its head SHA matches.
- [ ] Owner signed a `phase=promotion` annotated tag with current inventory/evidence hashes, expiry, PR, payment flag, and fresh nonce.
- [ ] Payment-sensitive releases also have a separate `phase=payment` tag.
- [ ] External controller dry run passes before `--execute`.
- [ ] Only the external controller performs the head-SHA-pinned merge.

## Production Authorization

- [ ] Resulting `origin/master` SHA has structural governed-promotion evidence. Direct-master work has been reconciled through `staging` before production authorization.
- [ ] Exact-master candidate evidence and controller-local qualification pass.
- [ ] Owner signed a new `phase=production` tag for the resulting master SHA.
- [ ] Payment-sensitive releases have a separate payment tag bound to the master SHA.
- [ ] Authorization and payment nonces are unused.
- [ ] Production credential paths exist and permissions are restrictive.
- [ ] External controller dry run reports `authorized_pre_checkout`.
- [ ] Recheck `origin/master`; any movement requires new evidence and authorization.

## Post-Deploy Proof

- [ ] Remote HEAD, `.deploy-state/last_deployed_commit`, `deployed_head`, `remote_head`, and `expected_commit` equal the target.
- [ ] Production contract reports `ok=true` and runtime health SHA equals the target.
- [ ] IMS, POS, Storefront, tenant-store, and frontend asset parity checks pass.
- [ ] Successful deployment ends at `deployed_pending_accuracy`; it is not reported as completed.
- [ ] Immutable `release_record.json` and `release_record.md` exist outside Git for the exact target SHA.
- [ ] Every release slice has a hash-verified API, UI, read-only database, or asset artifact captured after deployment.
- [ ] `npm run review:deployed-change-accuracy` exits successfully with `completion_state=accurately_reflected`.
- [ ] Separate trusted finalization recollects current exact-SHA production proof.
- [ ] Only passing per-slice proof transitions the controller ledger to terminal `completed` and creates immutable accuracy-finalization records.
- [ ] Missing or failed proof leaves `deployed_pending_accuracy` with residual risk. Failed entries remain preserved and nonces are never reused.

## Incident Stop Conditions

Stop and rotate/re-authorize when any signer, controller root account, production root account, GitHub/controller token, or production SSH key may be compromised. Preserve tags, ledger entries, evidence bundles, controller logs, and production proof. Never delete a ledger record to retry.
