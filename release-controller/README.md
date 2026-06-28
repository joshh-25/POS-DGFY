# External Signed Release Controller

This package is installed on a trusted Linux host outside all candidate checkouts. It is the production authorization boundary for the private GitHub Free repository described by ADR 0030.

## Bootstrap

1. Transfer a reviewed controller release through an authenticated administrative channel.
2. Verify its independently recorded SHA-256 before installation.
3. Run `sudo release-controller/install/install.sh`.
4. Keep `/opt/skupervisor-release-controller/current` pinned to the reviewed version.
5. Configure `/etc/skupervisor-release-controller/controller.json` as `root:root 0600`.
6. Import owner public signing keys into `/etc/skupervisor-release-controller/gnupg` and set `GNUPGHOME` for controller invocations.
7. Place the production SSH key in `/etc/skupervisor-release-controller/secrets` as `root:root 0600`.
8. Authenticate `gh` only on the controller host using its OS-protected secret store. Do not place the token in the repository or GitHub Actions.
9. Clone a bare mirror into `/var/lib/skupervisor-release-controller/repository.git`.

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
  --config /etc/skupervisor-release-controller/controller.json \
  --dry-run
```

Add `--execute` only after the dry-run result is reviewed. Payment-sensitive releases also require `--payment-tag`.

## Security Properties

1. Signature, tag target, hashes, expiry, signer, nonce, PR, and remote branch are checked before candidate checkout.
2. GitHub PR/check state is queried live by the controller.
3. Candidate qualification runs with production and signing secrets removed from its environment.
4. The controller uses fixed argv commands with `shell: false`.
5. Nonce files use atomic exclusive creation and remain present after success or failure.
6. Production SSH is invoked by installed controller code, not by a GitHub workflow.

## Recovery

Do not delete nonce entries to retry. Correct the failure, produce updated evidence if needed, and issue a new signed tag with a fresh nonce. Treat signer-key, controller-root, or production-root compromise as an incident under ADR 0030.
