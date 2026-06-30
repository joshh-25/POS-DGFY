# External Signed Release Controller

This package is installed on a trusted Linux host outside all candidate checkouts. It is the production authorization boundary for the private GitHub Free repository described by ADR 0030.

## Bootstrap

1. Record the exact controller source Git SHA, package SHA-256, installer version, validation evidence, full owner signer fingerprint, and explicit operator approval outside the candidate checkout.
2. Transfer that reviewed controller release through an authenticated administrative channel and independently verify the recorded SHA-256.
3. Run `sudo release-controller/install/install.sh`.
4. Keep `/opt/skupervisor-release-controller/current` pinned to the reviewed version.
5. Configure `/etc/skupervisor-release-controller/controller.json` as `root:root 0600`.
6. Import owner public signing keys into `/etc/skupervisor-release-controller/gnupg` and set `GNUPGHOME` for controller invocations.
7. Place the production SSH key in `/etc/skupervisor-release-controller/secrets` as `root:root 0600`.
8. Authenticate `gh` only on the controller host using its OS-protected secret store. Do not place the token in the repository or GitHub Actions.
9. Clone a bare mirror into `/var/lib/skupervisor-release-controller/repository.git`.
10. Confirm `/var/lib/skupervisor-release-controller/releases` is `root:root 0700`; immutable per-deployment JSON and Markdown records are written beneath the exact target SHA.

When GitHub Actions runners are unavailable because of account billing or a spending limit, set `github_actions_billing_fallback.enabled` only in the root-owned controller configuration. Before signing, collect the exact-SHA report with `npm run collect:github-actions-unavailability` and bind it into candidate evidence using `--github-actions-unavailability`. Pass the same report path to the controller with `--github-actions-unavailability`; it recomputes the bound hash, independently re-queries the failed job, and accepts only a GitHub Actions job with no runner, zero steps, and the explicit billing allocation annotation. It then runs the normal exact-SHA qualification commands locally. Generic failures, missing checks, and jobs that started are rejected.

The installer does not generate keys, copy credentials, or enable production automatically.

## Owner Authorization

Create an annotated GPG-signed tag only after the reviewed inventory and candidate evidence hashes are final:

```bash
git tag -s "release-authorization/production/<sha>/<nonce>" <sha> \
  -F production-authorization.txt
git push origin "refs/tags/release-authorization/production/<sha>/<nonce>"
```

Use separate `promotion`, `production`, and, when required, `payment` tags. Never reuse a nonce.

## Dry Run

```bash
sudo --preserve-env=GNUPGHOME,GH_TOKEN \
  /opt/skupervisor-release-controller/current/bin/skupervisor-release-controller.js \
  --phase production \
  --target-sha <sha> \
  --tag <production-tag> \
  --inventory /trusted-spool/<sha>/batch_inventory.json \
  --evidence /trusted-spool/<sha>/candidate_evidence.json \
  --documentation-closure /trusted-spool/<sha>/documentation_closure.json \
  --regression-risk-notice /trusted-spool/<sha>/regression_risk_notice.json \
  --config /etc/skupervisor-release-controller/controller.json \
  --dry-run
```

Add `--execute` only after the dry-run result is reviewed. Payment-sensitive releases also require `--payment-tag`.

Successful production deployment ends in `deployed_pending_accuracy`, not `completed`. The controller writes `<release_records_dir>/<sha>/release_record.json` and `release_record.md` outside Git, then requires a separate trusted finalization operation:

```bash
sudo --preserve-env=GNUPGHOME,GH_TOKEN \
  /opt/skupervisor-release-controller/current/bin/skupervisor-release-controller.js \
  --phase production \
  --target-sha <sha> \
  --tag <production-tag> \
  --inventory /trusted-spool/<sha>/batch_inventory.json \
  --evidence /trusted-spool/<sha>/candidate_evidence.json \
  --documentation-closure /trusted-spool/<sha>/documentation_closure.json \
  --regression-risk-notice /trusted-spool/<sha>/regression_risk_notice.json \
  --accuracy-proof /trusted-spool/<sha>/deployed_accuracy_proof.json \
  --config /etc/skupervisor-release-controller/controller.json \
  --finalize --execute
```

Finalization recollects exact-SHA production proof, verifies every slice artifact and hash, writes immutable `accuracy_finalization.json` and `.md`, and only then transitions the nonce ledger to `completed`. Missing, failed, stale, or wrong-SHA proof leaves the release in `deployed_pending_accuracy` with recorded residual risk.

## Security Properties

1. Signature, tag target, hashes, expiry, signer, nonce, PR, and remote branch are checked before candidate checkout.
2. GitHub PR/check state is queried live by the controller.
3. Candidate qualification runs with production and signing secrets removed from its environment.
4. The controller uses fixed argv commands with `shell: false`.
5. Nonce files use atomic exclusive creation and remain present after success or failure.
6. Production SSH is invoked by installed controller code, not by a GitHub workflow.
7. Documentation closure is independently revalidated against the exact-SHA worktree and cannot be bypassed.
8. Post-deploy records are root-owned, mode `0600`, stored outside the deployed checkout, and never committed as proof of their own deployment SHA.
9. Billing fallback changes only where qualification runs; it cannot bypass failed tests, isolated QA, review, signed authorization, or production proof.

## Recovery

Do not delete nonce entries to retry. Correct the failure, produce updated evidence if needed, and issue a new signed tag with a fresh nonce. Treat signer-key, controller-root, or production-root compromise as an incident under ADR 0030.
