# Production Release Controller Checklist

Use this checklist for every production release under ADR 0030.

## Controller Installation

- [ ] Controller release checksum was verified out of band.
- [ ] Installed version is root-owned under `/opt/skupervisor-release-controller/releases/<version>`.
- [ ] `/opt/skupervisor-release-controller/current` points to the reviewed version.
- [ ] Config, GNUPG home, secret directory, mirror, worktrees, and nonce ledger are root-owned with restrictive permissions.
- [ ] Full owner signing-key fingerprints are allowlisted.
- [ ] Production SSH key exists only in the controller OS secret store.
- [ ] GitHub/controller token exists only in the controller OS secret store.
- [ ] QA identity cannot access production data or controller state.

## Promotion Authorization

- [ ] `origin/staging` equals the intended exact candidate SHA.
- [ ] Staging qualification passed and required checks have immutable URLs.
- [ ] Exactly one reviewed batch manifest exists in the candidate diff.
- [ ] Strict version 2 inventory validation passes with exact file coverage.
- [ ] QA summary and isolation proof pass for the exact staging SHA.
- [ ] Promotion PR is `staging -> master` and its head SHA matches.
- [ ] Owner signed a `phase=promotion` annotated tag with current inventory/evidence hashes, expiry, PR, payment flag, and fresh nonce.
- [ ] Payment-sensitive releases also have a separate `phase=payment` tag.
- [ ] External controller dry run passes before `--execute`.
- [ ] Only the external controller performs the head-SHA-pinned merge.

## Production Authorization

- [ ] Resulting `origin/master` SHA has structural governed-promotion evidence.
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
- [ ] Every release slice has a hash-verified API, UI, read-only database, or asset artifact captured after deployment.
- [ ] `npm run review:deployed-change-accuracy` exits successfully with `completion_state=accurately_reflected`.
- [ ] Controller ledger records terminal completion. Failed entries remain preserved and are never reused.

## Incident Stop Conditions

Stop and rotate/re-authorize when any signer, controller root account, production root account, GitHub/controller token, or production SSH key may be compromised. Preserve tags, ledger entries, evidence bundles, controller logs, and production proof. Never delete a ledger record to retry.
